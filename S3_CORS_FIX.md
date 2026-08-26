# S3 CORS Configuration Fix

## Problem

Frontend uploads to S3 are failing with CORS error:
```
Access to XMLHttpRequest at 'https://s3.amazonaws.com/gradeai-uploads/...' 
from origin 'http://localhost:5173' has been blocked by CORS policy
```

## Root Cause

The S3 bucket `gradeai-uploads` doesn't have CORS configuration to allow browser uploads from your frontend origin.

## Solution: Configure S3 Bucket CORS

### Option 1: AWS Console (Easiest)

1. **Go to S3 Console**: https://s3.console.aws.amazon.com/
2. **Select Bucket**: Click on `gradeai-uploads`
3. **Permissions Tab**: Click on the "Permissions" tab
4. **CORS Section**: Scroll down to "Cross-origin resource sharing (CORS)"
5. **Edit**: Click the "Edit" button
6. **Paste Configuration**: Copy and paste this JSON:

```json
[
    {
        "AllowedHeaders": [
            "*"
        ],
        "AllowedMethods": [
            "GET",
            "PUT",
            "POST",
            "DELETE",
            "HEAD"
        ],
        "AllowedOrigins": [
            "http://localhost:5173",
            "http://localhost:3000",
            "https://your-production-domain.com"
        ],
        "ExposeHeaders": [
            "ETag",
            "x-amz-server-side-encryption",
            "x-amz-request-id",
            "x-amz-id-2"
        ],
        "MaxAgeSeconds": 3600
    }
]
```

7. **Save Changes**: Click "Save changes"

### Option 2: AWS CLI

1. **Use the configuration file** `s3-cors-config.json` already created in the project root
2. **Apply it**:
```bash
aws s3api put-bucket-cors --bucket gradeai-uploads --cors-configuration file://s3-cors-config.json
```

3. **Verify it**:
```bash
aws s3api get-bucket-cors --bucket gradeai-uploads
```

### Option 3: Terraform/CloudFormation

If you're using Infrastructure as Code:

**Terraform:**
```hcl
resource "aws_s3_bucket_cors_configuration" "gradeai_uploads" {
  bucket = aws_s3_bucket.gradeai_uploads.id

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["GET", "PUT", "POST", "DELETE", "HEAD"]
    allowed_origins = [
      "http://localhost:5173",
      "http://localhost:3000",
      "https://your-production-domain.com"
    ]
    expose_headers  = ["ETag", "x-amz-server-side-encryption"]
    max_age_seconds = 3600
  }
}
```

**CloudFormation:**
```yaml
GradeAIUploadsBucket:
  Type: AWS::S3::Bucket
  Properties:
    BucketName: gradeai-uploads
    CorsConfiguration:
      CorsRules:
        - AllowedHeaders:
            - "*"
          AllowedMethods:
            - GET
            - PUT
            - POST
            - DELETE
            - HEAD
          AllowedOrigins:
            - http://localhost:5173
            - http://localhost:3000
            - https://your-production-domain.com
          ExposedHeaders:
            - ETag
            - x-amz-server-side-encryption
          MaxAge: 3600
```

## Explanation of CORS Configuration

### AllowedHeaders
```json
"AllowedHeaders": ["*"]
```
Allows any headers in the preflight request. The browser needs to send `Content-Type` and AWS signature headers.

### AllowedMethods
```json
"AllowedMethods": ["GET", "PUT", "POST", "DELETE", "HEAD"]
```
- **PUT**: Used for file uploads via presigned URL
- **GET**: Used for file downloads
- **HEAD**: Used to check if file exists
- **DELETE**: Used to delete files
- **POST**: Alternative upload method

### AllowedOrigins
```json
"AllowedOrigins": [
    "http://localhost:5173",    // Vite dev server
    "http://localhost:3000",    // Alternative dev port
    "https://your-production-domain.com"
]
```
⚠️ **IMPORTANT**: Replace `https://your-production-domain.com` with your actual production domain when deploying!

For development, you can temporarily use `"*"` but **NEVER use this in production**:
```json
"AllowedOrigins": ["*"]  // ⚠️ ONLY for testing, NOT for production
```

### ExposeHeaders
```json
"ExposeHeaders": [
    "ETag",
    "x-amz-server-side-encryption",
    "x-amz-request-id",
    "x-amz-id-2"
]
```
These headers need to be exposed so JavaScript can read them. The `ETag` is especially important for upload verification.

### MaxAgeSeconds
```json
"MaxAgeSeconds": 3600
```
Browser will cache the CORS preflight response for 1 hour (3600 seconds), reducing the number of preflight requests.

## Testing After Configuration

### 1. Verify CORS is Applied
```bash
aws s3api get-bucket-cors --bucket gradeai-uploads
```

Expected output:
```json
{
    "CORSRules": [
        {
            "AllowedHeaders": ["*"],
            "AllowedMethods": ["GET", "PUT", "POST", "DELETE", "HEAD"],
            "AllowedOrigins": [
                "http://localhost:5173",
                "http://localhost:3000",
                "https://your-production-domain.com"
            ],
            "ExposeHeaders": [...],
            "MaxAgeSeconds": 3600
        }
    ]
}
```

### 2. Test Upload in Frontend

1. **Clear Browser Cache**: Press `Ctrl+Shift+Delete` (or `Cmd+Shift+Delete` on Mac)
2. **Reload Page**: Hard refresh with `Ctrl+F5` (or `Cmd+Shift+R` on Mac)
3. **Try Upload**: Upload a document through the UI
4. **Check Console**: Should see successful upload, no CORS errors

### 3. Test with cURL (Optional)

Test the presigned URL with a preflight request:
```bash
curl -X OPTIONS \
  -H "Origin: http://localhost:5173" \
  -H "Access-Control-Request-Method: PUT" \
  -H "Access-Control-Request-Headers: content-type" \
  "YOUR_PRESIGNED_URL_HERE" \
  -v
```

Expected response should include:
```
Access-Control-Allow-Origin: http://localhost:5173
Access-Control-Allow-Methods: GET, PUT, POST, DELETE, HEAD
Access-Control-Allow-Headers: *
```

## Common Issues & Solutions

### Issue 1: Still Getting CORS Error After Configuration

**Solution**: Clear browser cache and reload
```bash
# Chrome/Edge
Ctrl+Shift+Delete → Clear cached images and files

# Or use incognito/private window
```

### Issue 2: Works Locally but Not in Production

**Solution**: Add your production domain to `AllowedOrigins`:
```json
"AllowedOrigins": [
    "http://localhost:5173",
    "https://gradeai.yourcompany.com"  // Add your domain
]
```

### Issue 3: CORS Error on GET (Download)

**Solution**: Make sure `GET` is in `AllowedMethods` and your domain is in `AllowedOrigins`.

### Issue 4: Using CloudFront?

If you're using CloudFront in front of S3, you need to:
1. Configure CORS on S3 (as above)
2. Configure CloudFront to forward these headers:
   - `Origin`
   - `Access-Control-Request-Headers`
   - `Access-Control-Request-Method`

### Issue 5: Bucket in Different Region

The error shows `us-east-1`. Make sure your backend S3 service is configured for the same region:

Check `backend/app/core/config.py`:
```python
AWS_REGION: str = "us-east-1"  # Must match bucket region
```

## Security Considerations

### Production Best Practices

1. **Never use `"*"` for AllowedOrigins in production**
   ```json
   // ❌ BAD (allows any website to access your bucket)
   "AllowedOrigins": ["*"]
   
   // ✅ GOOD (specific domains only)
   "AllowedOrigins": ["https://gradeai.yourcompany.com"]
   ```

2. **Use HTTPS in production**
   ```json
   "AllowedOrigins": [
       "https://gradeai.yourcompany.com",  // ✅ HTTPS
       "http://localhost:5173"              // Only for dev
   ]
   ```

3. **Limit methods to what you need**
   ```json
   // If you only upload and download:
   "AllowedMethods": ["GET", "PUT", "HEAD"]
   ```

4. **Enable S3 Block Public Access**
   - Go to bucket permissions
   - Enable "Block all public access"
   - Files are still accessible via presigned URLs

5. **Set appropriate presigned URL expiration**
   
   In `backend/app/api/v1/endpoints/uploads.py`:
   ```python
   # Currently set to 1 hour (3600 seconds)
   expires_in=3600
   
   # Consider shorter for sensitive files:
   expires_in=900  # 15 minutes
   ```

## Monitoring

After applying CORS configuration, monitor:

1. **CloudWatch S3 Metrics**
   - 4xx errors (should decrease)
   - Request count

2. **Application Logs**
   - Check `backend/app/services/s3_service.py` logs
   - Look for "s3_presigned_upload_url_generated" events

3. **Browser Console**
   - No CORS errors
   - Successful PUT requests to S3

## Summary

**Quick Fix Checklist:**
- [ ] Apply CORS configuration to `gradeai-uploads` bucket
- [ ] Verify CORS is active: `aws s3api get-bucket-cors --bucket gradeai-uploads`
- [ ] Clear browser cache
- [ ] Test upload in frontend
- [ ] Update AllowedOrigins for production domain before deploying

**After fixing, you should see:**
- ✅ No CORS errors in browser console
- ✅ File uploads succeed
- ✅ Progress bar works correctly
- ✅ Documents show "Processing" then "Ready" status

---

**Need Help?**
- Check AWS S3 CORS documentation: https://docs.aws.amazon.com/AmazonS3/latest/userguide/cors.html
- Test CORS with browser DevTools → Network tab → Look for OPTIONS requests
