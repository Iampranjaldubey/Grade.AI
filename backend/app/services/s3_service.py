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
        if settings.aws_s3_endpoint:
            client_kwargs["endpoint_url"] = settings.aws_s3_endpoint

        self.bucket = settings.aws_s3_bucket
        self._client = boto3.client(**client_kwargs)

    def generate_presigned_upload_url(self, key: str, expires_in: int = 3600) -> str | None:
        try:
            return self._client.generate_presigned_url(
                "put_object",
                Params={"Bucket": self.bucket, "Key": key},
                ExpiresIn=expires_in,
            )
        except ClientError as exc:
            logger.error("s3_presign_failed", key=key, error=str(exc))
            return None
