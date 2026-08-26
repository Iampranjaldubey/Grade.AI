# Quick Fix: S3 CORS Error

## The Error
```
Access to XMLHttpRequest blocked by CORS policy: 
No 'Access-Control-Allow-Origin' header is present
```

## Quick Solution (5 minutes)

### Step 1: Open AWS Console
https://s3.console.aws.amazon.com/s3/buckets/gradeai-uploads

### Step 2: Go to Permissions → CORS

### Step 3: Paste This
```json
[
    {
        "AllowedHeaders": ["*"],
        "AllowedMethods": ["GET", "PUT", "POST", "DELETE", "HEAD"],
        "AllowedOrigins": [
            "http://localhost:5173",
            "http://localhost:3000",
            "https://your-production-domain.com"
        ],
        "ExposeHeaders": ["ETag"],
        "MaxAgeSeconds": 3600
    }
]
```

### Step 4: Save & Test
1. Click "Save changes"
2. Clear browser cache (Ctrl+Shift+Delete)
3. Reload page (Ctrl+F5)
4. Try upload again ✅

## Using AWS CLI Instead?
```bash
aws s3api put-bucket-cors \
  --bucket gradeai-uploads \
  --cors-configuration file://s3-cors-config.json
```

## ⚠️ Before Production
Replace `https://your-production-domain.com` with your actual domain!

## Still Not Working?
See detailed guide: `S3_CORS_FIX.md`
