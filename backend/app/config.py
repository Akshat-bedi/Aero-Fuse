"""Application settings.

Configuration comes from environment variables or an optional ``.env`` file
next to this project. Defaults are deterministic, offline demo values.
"""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime configuration for the AirOps DSS backend."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    app_name: str = "AirOps DSS Backend"
    app_version: str = "0.1.0"
    host: str = "0.0.0.0"
    port: int = 8000
    log_level: str = "INFO"

    cors_origins: str = "http://localhost:5173"

    seed: int = 42
    db_url: str = "sqlite:///./airops.db"

    auth_enabled: bool = False
    jwt_secret: str = "dev-only-change-me"

    solver_time_limit_s: float = 4.0
    reco_ttl_min: int = 15
    stale_data_sec: int = 30

    sim_start_time: str = "2026-10-17T12:00:00.000Z"
    sim_default_speed: int = 1

    @property
    def cors_origin_list(self) -> list[str]:
        """CORS origins as a list (``CORS_ORIGINS`` is comma-separated)."""
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    """Return the process-wide cached settings instance."""
    return Settings()
