from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "INE Abstention API"
    environment: str = "development"
    debug: bool = False
    database_url: str = Field(
        default="postgresql+psycopg://ine:ine_local@localhost:5432/ine_abstention",
        repr=False,
    )
    migration_database_url: str | None = Field(default=None, repr=False)
    database_schema: str = Field(default="public", pattern=r"^[a-z_][a-z0-9_]*$")
    database_pool_size: int = Field(default=3, ge=1, le=20)
    database_max_overflow: int = Field(default=2, ge=0, le=20)
    cors_origins: list[str] = []


@lru_cache
def get_settings() -> Settings:
    return Settings()
