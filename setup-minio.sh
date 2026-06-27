#!/bin/bash
# MinIO Setup Script for GradeAI

echo "🚀 Setting up MinIO for GradeAI..."

# Check if mc (MinIO Client) is installed
if ! command -v mc &> /dev/null; then
    echo "❌ MinIO Client (mc) is not installed"
    echo "Install it from: https://min.io/docs/minio/linux/reference/minio-mc.html"
    echo ""
    echo "Windows: choco install minio-client"
    echo "Mac: brew install minio/stable/mc"
    echo "Linux: curl https://dl.min.io/client/mc/release/linux-amd64/mc -o /usr/local/bin/mc && chmod +x /usr/local/bin/mc"
    exit 1
fi

echo "✅ MinIO Client found"

# Configure MinIO alias
echo "📝 Configuring MinIO alias..."
mc alias set myminio http://localhost:9000 minioadmin minioadmin

# Check if MinIO is accessible
if ! mc admin info myminio &> /dev/null; then
    echo "❌ Cannot connect to MinIO at http://localhost:9000"
    echo "Make sure MinIO is running: docker-compose up -d minio"
    exit 1
fi

echo "✅ Connected to MinIO"

# Create bucket
echo "📦 Creating bucket 'gradeai-files'..."
mc mb myminio/gradeai-files --ignore-existing

# Set bucket policy to allow downloads (needed for presigned URLs)
echo "🔐 Setting bucket policy..."
mc anonymous set download myminio/gradeai-files

# Apply CORS configuration
echo "🌐 Applying CORS configuration..."
if [ -f "minio-cors.json" ]; then
    mc admin bucket remote add myminio/gradeai-files --service=replica minio-cors.json 2>/dev/null || true
    # Alternative approach - set policy directly
    cat > /tmp/minio-policy.json << 'EOF'
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Principal": {"AWS": ["*"]},
            "Action": ["s3:GetObject"],
            "Resource": ["arn:aws:s3:::gradeai-files/*"]
        }
    ]
}
EOF
    mc anonymous set-json /tmp/minio-policy.json myminio/gradeai-files
    rm /tmp/minio-policy.json
    echo "✅ Bucket policy applied"
    echo "⚠️  Note: CORS must be configured via MinIO Console at http://localhost:9001"
else
    echo "❌ minio-cors.json not found"
fi

# Verify setup
echo ""
echo "🔍 Verifying setup..."
mc ls myminio/

echo ""
echo "✅ MinIO setup complete!"
echo ""
echo "📋 Next steps:"
echo "1. Open MinIO Console: http://localhost:9001"
echo "2. Login with: minioadmin / minioadmin"
echo "3. Navigate to: Buckets → gradeai-files → Settings"
echo "4. Add CORS rules from minio-cors.json"
echo ""
echo "5. Test your setup:"
echo "   - Start backend: docker-compose up backend"
echo "   - Start frontend: cd frontend && npm run dev"
echo "   - Try uploading a file"
echo ""
