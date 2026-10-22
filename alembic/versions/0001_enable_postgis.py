"""Habilitar PostGIS sin definir todavía el esquema electoral."""

from alembic import op

revision = "0001_enable_postgis"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS postgis")


def downgrade() -> None:
    # La extensión puede ser compartida por tablas ajenas a esta aplicación.
    # Se conserva para evitar eliminar dependencias o datos geográficos.
    pass
