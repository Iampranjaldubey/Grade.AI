import boto3
from botocore.client import Config

client = boto3.client(
    's3',
    endpoint_url='http://localhost:9000',
    aws_access_key_id='minioadmin',
    aws_secret_access_key='minioadmin',
    region_name='us-east-1',
    config=Config(signature_version='s3v4', s3={'addressing_style': 'path'})
)

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
print()
print("Test with:")
print(f"curl -X PUT -H \"Content-Type: text/plain\" -d \"Hello MinIO\" \"{url}\"")
