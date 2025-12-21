"""Optional AWS / S3 storage configuration.
Sets DEFAULT_FILE_STORAGE and STATICFILES_STORAGE when USE_S3 is enabled.
"""

import os


def env(key, default=None):
    return os.environ.get(key, default)


# Toggle S3 usage
USE_S3 = env("USE_S3", "false").lower() in ("1", "true", "yes")

if USE_S3:
    DEFAULT_FILE_STORAGE = "storages.backends.s3boto3.S3Boto3Storage"
    STATICFILES_STORAGE = "storages.backends.s3boto3.S3StaticStorage"
    AWS_ACCESS_KEY_ID = env("AWS_ACCESS_KEY_ID")
    AWS_SECRET_ACCESS_KEY = env("AWS_SECRET_ACCESS_KEY")
    AWS_STORAGE_BUCKET_NAME = env("AWS_STORAGE_BUCKET_NAME")
    AWS_S3_REGION_NAME = env("AWS_S3_REGION_NAME", "us-east-1")
