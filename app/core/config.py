from functools import lru_cache

from pydantic import Field, SecretStr, model_validator
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
    # Credential shared only by FastAPI and server-side Next.js. Never NEXT_PUBLIC_.
    api_internal_token: SecretStr | None = Field(default=None, repr=False)

    @model_validator(mode="after")
    def production_guards(self):
        if self.environment.lower() in {"production", "prod"}:
            if self.debug:
                raise ValueError("DEBUG must be false in production")
            if self.api_internal_token is None or len(self.api_internal_token.get_secret_value()) < 32:
                raise ValueError("API_INTERNAL_TOKEN of at least 32 characters is required in production")
            if "*" in self.cors_origins:
                raise ValueError("Wildcard CORS is not allowed in production")
        elif self.api_internal_token and len(self.api_internal_token.get_secret_value()) < 32:
            raise ValueError("API_INTERNAL_TOKEN must contain at least 32 characters")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
