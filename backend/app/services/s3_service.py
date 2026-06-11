import boto3
from botocore.client import Config
from botocore.exceptions import ClientError
import structlog

from app.core.config import Settings

logger = structlog.get_logger(__name__)


class S3Service:
    def __init__(self, settings: Settings) -> None:
        client_kwargs: dict = {
            "service_name": "s3",
            "region_name": settings.aws_region,
            "aws_access_key_id": settings.aws_access_key_id or None,
            "aws_secret_access_key": settings.aws_secret_access_key or None,
            "config": Config(signature_version="s3v4"),
        }
        # Support both AWS_ENDPOINT_URL and AWS_S3_ENDPOINT
        endpoint = settings.aws_endpoint_url or settings.aws_s3_endpoint
        if endpoint:
            client_kwargs["endpoint_url"] = endpoint

        self.bucket = settings.aws_s3_bucket
        self._client = boto3.client(
            "s3",
            endpoint_url=settings.aws_endpoint_url,
            aws_access_key_id=settings.aws_access_key_id,
            aws_secret_access_key=settings.aws_secret_access_key,
            region_name=settings.aws_region,
            config=boto3.session.Config(
                signature_version="s3v4",
                s3={"addressing_style": "path"}
            )
        )
        self._ensure_bucket_exists()

    def _ensure_bucket_exists(self) -> None:
        """Create bucket if it doesn't exist (for MinIO/localstack)."""
        try:
            self._client.head_bucket(Bucket=self.bucket)
            logger.info("s3_bucket_exists", bucket=self.bucket)
        except ClientError as exc:
            error_code = exc.response.get("Error", {}).get("Code")
            if error_code == "404":
                try:
                    self._client.create_bucket(Bucket=self.bucket)
                    logger.info("s3_bucket_created", bucket=self.bucket)
                except ClientError as create_exc:
                    logger.error(
                        "s3_bucket_create_failed",
                        bucket=self.bucket,
                        error=str(create_exc),
                    )
            else:
                logger.error("s3_bucket_check_failed", bucket=self.bucket, error=str(exc))

    def generate_presigned_upload_url(
        self, file_key: str, content_type: str, expires: int = 3600
    ) -> str:
        """Generate a presigned URL for uploading a file to S3."""
        try:
            url = self._client.generate_presigned_url(
                "put_object",
                Params={
                    "Bucket": self.bucket,
                    "Key": file_key,
                    "ContentType": content_type,
                },
                ExpiresIn=expires,
            )
            logger.info("s3_presigned_upload_url_generated", file_key=file_key)
            return url
        except ClientError as exc:
            logger.error("s3_presign_upload_failed", key=file_key, error=str(exc))
            raise

    def generate_presigned_download_url(self, file_key: str, expires: int = 3600) -> str:
        """Generate a presigned URL for downloading a file from S3."""
        try:
            url = self._client.generate_presigned_url(
                "get_object",
                Params={"Bucket": self.bucket, "Key": file_key},
                ExpiresIn=expires,
            )
            logger.info("s3_presigned_download_url_generated", file_key=file_key)
            return url
        except ClientError as exc:
            logger.error("s3_presign_download_failed", key=file_key, error=str(exc))
            raise

    def delete_file(self, file_key: str) -> bool:
        """Delete a file from S3."""
        try:
            self._client.delete_object(Bucket=self.bucket, Key=file_key)
            logger.info("s3_file_deleted", file_key=file_key)
            return True
        except ClientError as exc:
            logger.error("s3_delete_failed", key=file_key, error=str(exc))
            return False

    def file_exists(self, file_key: str) -> bool:
        """Check if a file exists in S3."""
        try:
            self._client.head_object(Bucket=self.bucket, Key=file_key)
            return True
        except ClientError as exc:
            error_code = exc.response.get("Error", {}).get("Code")
            if error_code == "404":
                return False
            logger.error("s3_file_exists_check_failed", key=file_key, error=str(exc))
            return False


def get_s3_service(settings: Settings) -> S3Service:
    """Dependency for FastAPI endpoints."""
    return S3Service(settings)
