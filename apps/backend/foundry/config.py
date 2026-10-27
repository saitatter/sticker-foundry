from functools import lru_cache
from pathlib import Path

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy.engine import make_url


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env", "apps/backend/.env"),
        extra="ignore",
    )
    app_env: str = "development"
    database_url: str = "postgresql://stickers:stickers@localhost:5432/stickers"
    redis_url: str = "redis://localhost:6379"
    jwt_secret: str = "change-this-long-random-secret"
    access_token_ttl: str = "15m"
    refresh_token_ttl_days: int = 30
    auth_refresh_cookie_enabled: bool = True
    auth_refresh_cookie_secure: bool = False
    auth_refresh_cookie_same_site: str = "lax"
    auth_refresh_cookie_name: str = "stickerfoundry_refresh"
    auth_refresh_cookie_path: str = "/api/auth"
    cors_origin: str = "http://localhost:8080,http://localhost:5173"
    data_dir: Path = Path("data")
    export_cache_dir: str = ""
    password_reset_public_url: str = "http://localhost:8080"
    password_reset_ttl_minutes: int = 30
    instance_name: str = "Sticker Foundry"
    instance_description: str = "Self-hosted sticker pack management"
    registration_mode: str = "open"
    registration_invite_code: str = ""
    storage_quota_bytes: str = ""
    audit_retention_days: str = ""
    storage_driver: str = "disk"
    s3_bucket: str = ""
    s3_region: str = "us-east-1"
    s3_endpoint: str = ""
    s3_prefix: str = "packs"
    s3_force_path_style: bool = True
    s3_access_key_id: str = ""
    s3_secret_access_key: str = ""
    upload_max_pixels: int = 25_000_000
    upload_max_total_pixels: int = 80_000_000
    upload_max_animated_edit_pixels: int = 20_000_000
    upload_max_animated_frames: int = 300
    queue_prefix: str = "sticker-foundry"
    queue_attempts: int = 3
    queue_backoff_ms: int = 1000
    media_queue_max_waiting: int = 50
    media_queue_retry_after_seconds: int = 5
    background_removal_command: str = ""
    background_removal_timeout_ms: int = 120_000
    throttle_ttl_ms: int = 60_000
    throttle_limit: int = 300
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_secure: bool = False
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = ""
    testing: bool = False

    @model_validator(mode="after")
    def production_configuration(self):
        if self.app_env == "production":
            if len(self.jwt_secret) < 32 or self.jwt_secret.startswith(
                ("change-", "replace-", "local-development-")
            ):
                raise ValueError("JWT_SECRET must be a unique secret of at least 32 characters")
            _ = self.origins
        return self

    @field_validator("s3_prefix")
    @classmethod
    def safe_prefix(cls, value: str) -> str:
        if (
            not value
            or "\\" in value
            or value.startswith("/")
            or ":" in value
            or any(part in {".", ".."} for part in value.split("/"))
        ):
            raise ValueError("S3_PREFIX must be a relative storage prefix")
        return value.strip("/")

    @property
    def sqlalchemy_url(self) -> str:
        if self.database_url.startswith("sqlite"):
            return self.database_url
        return (
            make_url(self.database_url)
            .set(drivername="postgresql+psycopg")
            .render_as_string(hide_password=False)
        )

    @property
    def origins(self) -> list[str]:
        values = [value.strip() for value in self.cors_origin.split(",") if value.strip()]
        if self.app_env == "production" and (not values or "*" in values):
            raise ValueError("CORS_ORIGIN must be an explicit allowlist in production")
        return values

    @property
    def export_directory(self) -> Path:
        return Path(self.export_cache_dir) if self.export_cache_dir else self.data_dir / "export-cache"


@lru_cache
def get_settings() -> Settings:
    return Settings()
