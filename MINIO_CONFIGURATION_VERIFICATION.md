# MinIO Configuration Verification & Fix

## Current Setup Analysis

### ✅ What's Configured Correctly

1. **S3 Service with Dual Client Pattern** ✅
   - Separate `_client` for internal operations (backend → MinIO)
   - Separate `_presign_client` for presigned URLs (browser → MinIO)
   - Correct for Docker networking scenarios

2. **Environment Variables** ✅
   ```env
   AWS_ENDPOINT_URL=http://localhost:9000          # Backend talks to MinIO
   AWS_S3_PUBLIC_ENDPOINT=http://localhost:9000    # Browser talks to MinIO
   AWS_ACCESS_KEY_ID=minioadmin
   AWS_SECRET_ACCESS_KEY=minioadmin
   AWS_S3_BUCKET=gradeai-files
   AWS_REGION=us-east-1
   ```

3. **Docker Compose** ✅
   - MinIO service running on ports 9000 (API) and 9001 (Console)
   - Persistent storage with volume `minio_data`
   - Correct credentials match .env file

### ⚠️ Issues Found & Fixes Needed

## Issue 1: MinIO CORS Configuration Missing

**Problem**: MinIO doesn't have CORS configured, causing the same error you're seeing:
```
Access to XMLHttpRequest blocked by CORS policy
```

**Solution**: Configure MinIO bucket CORS policy

### Fix A: Using MinIO Console (Easiest)

1. **Access MinIO Console**:
   ```
   http://localhost:9001
   ```

2. **Login**:
   - Username: `minioadmin`
   - Password: `minioadmin`

3. **Navigate to Bucket**:
   - Click on **Buckets** in left sidebar
   - If `gradeai-files` doesn't exist, click **Create Bucket** and create it
   - Click on `gradeai-files` bucket

4. **Configure CORS**:
   - Click **Settings** → **Access Rules**
   - Or look for **CORS Configuration** section
   - Click **Edit** or **Add CORS Rule**
   - Add this configuration:

   ```json
   {
       "CORSRules": [
           {
               "AllowedOrigins": [
                   "http://localhost:5173",
                   "http://localhost:3000",
                   "http://localhost"
               ],
               "AllowedMethods": [
                   "GET",
                   "PUT",
                   "POST",
                   "DELETE",
                   "HEAD"
               ],
               "AllowedHeaders": [
                   "*"
               ],
               "ExposeHeaders": [
                   "ETag",
                   "Content-Length"
               ]
           }
       ]
   }
   ```

5. **Save Changes**

### Fix B: Using MinIO Client (mc)

1. **Install MinIO Client** (if not installed):
   ```bash
   # Windows (using Chocolatey)
   choco install minio-client

   # Or download from: https://min.io/docs/minio/linux/reference/minio-mc.html
   ```

2. **Configure mc alias**:
   ```bash
   mc alias set myminio http://localhost:9000 minioadmin minioadmin
   ```

3. **Create bucket** (if doesn't exist):
   ```bash
   mc mb myminio/gradeai-files
   ```

4. **Set CORS policy**:
   
   Create file `minio-cors.json`:
   ```json
   {
       "CORSRules": [
           {
               "AllowedOrigins": ["http://localhost:5173", "http://localhost:3000", "http://localhost"],
               "AllowedMethods": ["GET", "PUT", "POST", "DELETE", "HEAD"],
               "AllowedHeaders": ["*"],
               "ExposeHeaders": ["ETag", "Content-Length"]
           }
       ]
   }
   ```

   Apply it:
   ```bash
   mc anonymous set-json minio-cors.json myminio/gradeai-files
   ```

5. **Verify CORS**:
   ```bash
   mc anonymous get-json myminio/gradeai-files
   ```

### Fix C: Using Docker Exec (Alternative)

If mc is installed in MinIO container:

```bash
docker exec -it gradeai-minio mc alias set local http://localhost:9000 minioadmin minioadmin
docker exec -it gradeai-minio mc mb local/gradeai-files --ignore-existing
```

Then create cors.json and apply it similarly.

## Issue 2: Bucket Name Mismatch ⚠️

**Your .env has**: `AWS_S3_BUCKET=gradeai-files`
**Error shows**: `gradeai-uploads` (from your earlier AWS S3 attempt)

**Verification Needed**: Make sure you're using the correct bucket name everywhere.

**Check**:
1. Is the bucket `gradeai-files` created in MinIO?
2. Are uploads trying to use `gradeai-files` or `gradeai-uploads`?

**To verify bucket exists**:
```bash
# Using MinIO Console
http://localhost:9001 → Buckets

# Or using mc
mc ls myminio/
```

## Issue 3: Docker Networking Context ⚠️

Your `.env` has both endpoints pointing to `localhost:9000`:
```env
AWS_ENDPOINT_URL=http://localhost:9000
AWS_S3_PUBLIC_ENDPOINT=http://localhost:9000
```

**This is correct IF**:
- ✅ Your backend is running **outside Docker** (directly on host)
- ✅ Your frontend (browser) accesses MinIO via localhost

**This is WRONG IF**:
- ❌ Your backend is running **inside Docker** (using `docker-compose up`)

### Fix for Docker-Based Backend

If running backend in Docker, update `.env`:

```env
# Backend (inside Docker) talks to MinIO via Docker network
AWS_ENDPOINT_URL=http://minio:9000

# Browser (outside Docker) talks to MinIO via localhost
AWS_S3_PUBLIC_ENDPOINT=http://localhost:9000
```

**How to tell which you're using**:
- Running `docker-compose up`? → Backend is in Docker → Use `minio:9000` for internal
- Running `uvicorn app.main:app` directly? → Backend is on host → Use `localhost:9000`

## Complete Verification Checklist

### 1. ✅ Check MinIO is Running
```bash
# Check service is up
docker ps | grep minio

# Should show:
# CONTAINER_ID   IMAGE         PORTS
# ...            minio/minio   0.0.0.0:9000->9000/tcp, 0.0.0.0:9001->9001/tcp
```

### 2. ✅ Access MinIO Console
```
Open: http://localhost:9001
Login: minioadmin / minioadmin
```

### 3. ✅ Verify Bucket Exists
```bash
mc alias set myminio http://localhost:9000 minioadmin minioadmin
mc ls myminio/

# Should show:
# [2024-06-14 ...] gradeai-files/
```

If not exists:
```bash
mc mb myminio/gradeai-files
```

### 4. ✅ Configure CORS
Use Method A (Console) or Method B (mc) from above.

### 5. ✅ Set Bucket Policy (Make it accessible)
```bash
# Allow anonymous downloads (needed for presigned URLs to work)
mc anonymous set download myminio/gradeai-files
```

### 6. ✅ Test Presigned URL Generation

Create test script `test_minio.py`:
```python
import boto3
from botocore.client import Config

# Use public endpoint for presigned URLs
client = boto3.client(
    's3',
    endpoint_url='http://localhost:9000',
    aws_access_key_id='minioadmin',
    aws_secret_access_key='minioadmin',
    region_name='us-east-1',
    config=Config(signature_version='s3v4', s3={'addressing_style': 'path'})
)

# Generate presigned upload URL
url = client.generate_presigned_url(
    'put_object',
    Params={
        'Bucket': 'gradeai-files',
        'Key': 'test/test.txt',
        'ContentType': 'text/plain'
    },
    ExpiresIn=3600
)

print(f"Presigned URL: {url}")
print(f"\nTest with:")
print(f"curl -X PUT -H 'Content-Type: text/plain' -d 'Hello MinIO' '{url}'")
```

Run it:
```bash
cd backend
python test_minio.py
```

### 7. ✅ Test Upload via cURL
```bash
# Use the URL from above
curl -X PUT -H 'Content-Type: text/plain' -d 'Hello MinIO' '<PRESIGNED_URL>'

# Should return: HTTP 200 OK
```

### 8. ✅ Clear Browser Cache & Test Frontend
```
1. Clear cache: Ctrl+Shift+Delete
2. Hard reload: Ctrl+F5
3. Try upload in UI
```

## Environment Files Summary

### For Backend in Docker (docker-compose up)
```env
# .env
AWS_ENDPOINT_URL=http://minio:9000              # Docker network
AWS_S3_PUBLIC_ENDPOINT=http://localhost:9000    # Browser access
AWS_ACCESS_KEY_ID=minioadmin
AWS_SECRET_ACCESS_KEY=minioadmin
AWS_S3_BUCKET=gradeai-files
AWS_REGION=us-east-1
```

### For Backend on Host (uvicorn directly)
```env
# .env
AWS_ENDPOINT_URL=http://localhost:9000          # Local access
AWS_S3_PUBLIC_ENDPOINT=http://localhost:9000    # Browser access
AWS_ACCESS_KEY_ID=minioadmin
AWS_SECRET_ACCESS_KEY=minioadmin
AWS_S3_BUCKET=gradeai-files
AWS_REGION=us-east-1
```

## Common Issues & Solutions

### Issue: "Bucket does not exist"
```bash
mc mb myminio/gradeai-files
```

### Issue: "Access Denied"
```bash
# Set bucket policy to allow downloads
mc anonymous set download myminio/gradeai-files

# Or make fully public (development only!)
mc anonymous set public myminio/gradeai-files
```

### Issue: CORS still not working
1. Verify CORS is applied:
   ```bash
   mc anonymous get-json myminio/gradeai-files
   ```

2. Restart MinIO:
   ```bash
   docker-compose restart minio
   ```

3. Clear browser cache completely

### Issue: Wrong endpoint in presigned URL
Check backend logs for the generated URL. It should show:
```
http://localhost:9000/gradeai-files/...
```

If it shows `http://minio:9000/...`, your browser can't reach that. Fix:
- Set `AWS_S3_PUBLIC_ENDPOINT=http://localhost:9000` in .env
- Restart backend

## MinIO vs AWS S3 Differences

### ✅ What's the Same
- Same boto3 API
- Same presigned URL mechanism
- Same CORS configuration approach

### ⚠️ What's Different
1. **Endpoint**: Must specify endpoint_url for MinIO
2. **Path style**: MinIO uses path-style URLs (`localhost:9000/bucket/key`)
3. **CORS**: Applied per-bucket in MinIO Console/mc
4. **Authentication**: MinIO uses `minioadmin/minioadmin` by default

## Production Considerations

### Security
1. **Change default credentials**:
   ```env
   MINIO_ROOT_USER=admin-production
   MINIO_ROOT_PASSWORD=<strong-password>
   ```

2. **Use TLS/HTTPS**:
   - Configure MinIO with SSL certificates
   - Update endpoint to `https://minio.yourdomain.com`

3. **Restrict CORS origins**:
   ```json
   "AllowedOrigins": ["https://app.yourdomain.com"]
   ```

4. **Bucket policies**:
   - Don't use `anonymous set public`
   - Use specific policies for specific access patterns

### High Availability
- Use MinIO distributed mode (multiple servers)
- Configure load balancer
- Use persistent volumes on reliable storage

## Quick Start Commands

**Start everything**:
```bash
docker-compose up -d
```

**Setup MinIO**:
```bash
# Install mc
choco install minio-client

# Configure
mc alias set myminio http://localhost:9000 minioadmin minioadmin

# Create bucket
mc mb myminio/gradeai-files

# Set policy
mc anonymous set download myminio/gradeai-files

# Set CORS (create minio-cors.json first)
mc anonymous set-json minio-cors.json myminio/gradeai-files
```

**Verify**:
```bash
mc ls myminio/
mc anonymous get-json myminio/gradeai-files
```

**Test backend**:
```bash
curl http://localhost:8000/api/v1/health
```

**Access MinIO Console**:
```
http://localhost:9001
```

## Summary

Your MinIO configuration is **mostly correct** but needs:

1. ✅ **CORS configuration** on the `gradeai-files` bucket
2. ⚠️ **Bucket policy** to allow downloads
3. ⚠️ **Verify bucket exists** in MinIO
4. ⚠️ **Check endpoint configuration** based on where backend runs (Docker vs host)

**Next Steps**:
1. Access MinIO Console (http://localhost:9001)
2. Verify/create `gradeai-files` bucket
3. Add CORS configuration (see Fix A above)
4. Set bucket policy: `mc anonymous set download myminio/gradeai-files`
5. Clear browser cache and test upload

After these steps, your file uploads should work! ✅
