from collections.abc import Generator
from functools import lru_cache

from sqlalchemy import Engine, create_engine
from sqlalchemy.orm import Session

from app.core.config import get_settings


@lru_cache
def get_engine() -> Engine:
    settings = get_settings()
    return create_engine(
        settings.database_url,
        pool_pre_ping=True,
        pool_size=settings.database_pool_size,
        max_overflow=settings.database_max_overflow,
        # Conservar el valor double completo al leer bandas y límites de clasificación.
        connect_args={"connect_timeout": 5, "options": "-c extra_float_digits=3"},
    )


def get_db() -> Generator[Session, None, None]:
    with Session(get_engine()) as session:
        yield session
