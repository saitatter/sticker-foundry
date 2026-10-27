import os
import shutil
from functools import lru_cache
from pathlib import Path, PurePosixPath
from uuid import uuid4

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError

from .config import get_settings


class Storage:
    def __init__(self):
        self.settings = get_settings()
        self.root = self.settings.data_dir.resolve()
        self.client = None
        if self.settings.storage_driver == "s3":
            if not self.settings.s3_bucket:
                raise ValueError("S3_BUCKET is required")
            self.client = boto3.client(
                "s3",
                endpoint_url=self.settings.s3_endpoint or None,
                region_name=self.settings.s3_region,
                aws_access_key_id=self.settings.s3_access_key_id or None,
                aws_secret_access_key=self.settings.s3_secret_access_key or None,
                config=Config(
                    s3={"addressing_style": "path" if self.settings.s3_force_path_style else "auto"}
                ),
            )
        elif self.settings.storage_driver != "disk":
            raise ValueError("STORAGE_DRIVER must be disk or s3")

    def safe_key(self, key: str) -> str:
        value = PurePosixPath(key)
        if (
            not key
            or "\\" in key
            or ":" in key
            or value.is_absolute()
            or any(part in {".", "..", ""} for part in key.split("/"))
        ):
            raise ValueError("Invalid storage key")
        return str(value)

    def path(self, key: str) -> Path:
        destination = (self.root / self.safe_key(key)).resolve()
        if not destination.is_relative_to(self.root) or destination == self.root:
            raise ValueError("Storage key escapes the configured data directory")
        return destination

    def pack_key(self, pack_id: str, filename: str) -> str:
        base = f"{self.settings.s3_prefix}/{pack_id}"
        return self.safe_key(f"{base}/stickers/{filename}")

    def new_cover_key(self, pack_id: str) -> str:
        return self.safe_key(f"{self.settings.s3_prefix}/{pack_id}/covers/{uuid4()}.webp")

    def write(self, key: str, content: bytes, mime="image/webp"):
        key = self.safe_key(key)
        if self.client:
            self.client.put_object(Bucket=self.settings.s3_bucket, Key=key, Body=content, ContentType=mime)
            return
        target = self.path(key)
        target.parent.mkdir(parents=True, exist_ok=True)
        temporary = target.with_name(f".{target.name}.{uuid4()}.tmp")
        try:
            with temporary.open("wb") as output:
                output.write(content)
                output.flush()
                os.fsync(output.fileno())
            os.replace(temporary, target)
        finally:
            temporary.unlink(missing_ok=True)

    def read(self, key: str) -> bytes:
        key = self.safe_key(key)
        if self.client:
            try:
                response = self.client.get_object(Bucket=self.settings.s3_bucket, Key=key)
                with response["Body"] as body:
                    return body.read()
            except ClientError as error:
                if error.response["Error"]["Code"] in {"NoSuchKey", "404", "NotFound"}:
                    raise FileNotFoundError(key) from error
                raise
        return self.path(key).read_bytes()

    def exists(self, key: str) -> bool:
        key = self.safe_key(key)
        if self.client:
            try:
                self.client.head_object(Bucket=self.settings.s3_bucket, Key=key)
                return True
            except ClientError as error:
                if error.response["Error"]["Code"] in {"NoSuchKey", "404", "NotFound"}:
                    return False
                raise
        return self.path(key).is_file()

    def delete(self, key: str):
        key = self.safe_key(key)
        if self.client:
            self.client.delete_object(Bucket=self.settings.s3_bucket, Key=key)
        else:
            self.path(key).unlink(missing_ok=True)

    def copy(self, source: str, target: str):
        source, target = self.safe_key(source), self.safe_key(target)
        if self.client:
            self.client.copy_object(
                Bucket=self.settings.s3_bucket,
                Key=target,
                CopySource={"Bucket": self.settings.s3_bucket, "Key": source},
            )
        else:
            self.write(target, self.read(source))

    def delete_pack(self, pack_id: str):
        prefix = self.safe_key(f"{self.settings.s3_prefix}/{pack_id}")
        if self.client:
            paginator = self.client.get_paginator("list_objects_v2")
            for page in paginator.paginate(Bucket=self.settings.s3_bucket, Prefix=prefix + "/"):
                keys = [{"Key": item["Key"]} for item in page.get("Contents", [])]
                if keys:
                    self.client.delete_objects(Bucket=self.settings.s3_bucket, Delete={"Objects": keys})
        else:
            target = self.path(prefix)
            if target.exists():
                shutil.rmtree(target)


@lru_cache
def get_storage() -> Storage:
    return Storage()
