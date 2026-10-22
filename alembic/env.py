from sqlalchemy import create_engine, pool

from alembic import context
from app.core.config import get_settings
from app.db.models import Base

target_metadata = Base.metadata
settings = get_settings()


def include_name(name, type_, parent_names):
    """Limitar autogenerate al esquema del backend; ignorar Auth y Storage."""
    if type_ == "schema":
        return name == settings.database_schema or (
            name is None and settings.database_schema == "public"
        )
    return True


def run_migrations_offline() -> None:
    context.configure(
        url=settings.migration_database_url or settings.database_url,
        target_metadata=target_metadata,
        version_table_schema=settings.database_schema,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    engine = create_engine(
        settings.migration_database_url or settings.database_url,
        poolclass=pool.NullPool,
        # El rol de Supabase usa ine como search_path. Alembic debe reflejar
        # public como esquema por defecto y comparar ine de forma explícita;
        # de otro modo interpreta las tablas de ine como si no existieran.
        connect_args={"connect_timeout": 10, "options": "-c search_path=public"},
    )
    with engine.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            version_table_schema=settings.database_schema,
            include_schemas=True,
            include_name=include_name,
        )
        with context.begin_transaction():
            context.run_migrations()
    engine.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
