"""Crear el rol limitado y migrar únicamente el PostgreSQL local de Compose."""

import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import psycopg  # noqa: E402
from alembic.config import Config  # noqa: E402
from psycopg import sql  # noqa: E402
from sqlalchemy.engine import make_url  # noqa: E402

from alembic import command  # noqa: E402
from app.core.config import get_settings  # noqa: E402

if __name__ == "__main__":
    settings = get_settings()
    url = make_url(settings.migration_database_url or settings.database_url)
    if settings.environment != "local-demo" or url.host != "db":
        raise SystemExit("Bootstrap reservado al servicio db de Compose en modo local-demo")
    with psycopg.connect(
        host=url.host, port=url.port, dbname=url.database, user=url.username, password=url.password
    ) as conn:
        if not conn.execute("SELECT 1 FROM pg_roles WHERE rolname='ine_api'").fetchone():
            conn.execute(
                sql.SQL("CREATE ROLE ine_api LOGIN PASSWORD {}").format(
                    sql.Literal(os.environ["LOCAL_API_PASSWORD"])
                )
            )
        conn.execute(
            sql.SQL("CREATE SCHEMA IF NOT EXISTS {}").format(
                sql.Identifier(settings.database_schema)
            )
        )
        conn.execute(
            sql.SQL("GRANT USAGE ON SCHEMA {} TO ine_api").format(
                sql.Identifier(settings.database_schema)
            )
        )
        conn.execute(
            sql.SQL("ALTER ROLE ine_api SET search_path TO {}, public").format(
                sql.Identifier(settings.database_schema)
            )
        )
    command.upgrade(Config(str(ROOT / "alembic.ini")), "head")
    print("Local schema migrated; API role uses least privileges")
