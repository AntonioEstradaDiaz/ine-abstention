# Instalación desde un clon nuevo

El repositorio contiene código, configuraciones de ejemplo, informes y cartografía contextual.
No contiene credenciales, ZIP originales, Parquet, pesos ML ni `data/demo/snapshot.jsonl.gz`.
Clonar código no copia Supabase ni sus datos. Este flujo reconstruye los resultados desde fuentes oficiales.

## Ruta rápida: conectar una API ya preparada

1. Verificar `GET /api/v1/health/ready`, `/elections` y `/predictions?target_year=2027`.
2. En `frontend`, ejecutar `npm.cmd ci` con Node.js 24.
3. Crear `.env.local` con `BACKEND_URL=http://127.0.0.1:8000` o el puerto correspondiente.
4. Ejecutar `npm.cmd run dev`; abrir http://127.0.0.1:3000.

La disponibilidad técnica no implica que la base tenga los datos. Una base vacía puede pasar health/ready
y devolver elecciones vacías o 404 en predicciones. El dashboard mostrará esa ausencia.

## Reconstrucción local con Docker y fuentes del INE

Requisitos: Docker Desktop con contenedores Linux, Python 3.12+, uv, Node.js 24 y conexión a las fuentes oficiales.
Ejecutar desde la raíz del repositorio en PowerShell. No sobrescribir un `.env` existente.

```powershell
uv sync --locked --group ml
docker compose --env-file .env.docker.example up --build -d --wait api

# Variables de ESTA terminal: apuntan únicamente al PostgreSQL local.
$env:DATABASE_URL = 'postgresql+psycopg://ine_owner:ine_owner_local@127.0.0.1:15432/ine_abstention'
$env:MIGRATION_DATABASE_URL = $env:DATABASE_URL
$env:DATABASE_SCHEMA = 'ine'
$env:ENVIRONMENT = 'local-demo'

uv run python scripts/inspect_ccpc.py
uv run python scripts/prepare_ccpc.py
uv run python scripts/load_ccpc.py
uv run --group ml python scripts/train_models.py --register
uv run --group ml python scripts/generate_predictions.py --register
uv run python scripts/demo_backend.py --api-url http://127.0.0.1:8001 --output docs/demo-new-install.json

cd frontend
npm.cmd ci
npm.cmd run dev
```

Compose crea el esquema y aplica migraciones antes de servir. Los originales contienen aproximadamente
54.9 millones de celdas agregadas: la descarga y transformación son trabajos de preparación, no parte del arranque normal.
Los scripts verifican calidad e integridad; detener el proceso si las fuentes cambian o una validación falla.
No recortar, fabricar ni reemplazar datos para hacer pasar las comprobaciones.

Los comandos de descarga/carga/entrenamiento son los mismos de las fases previas. Esta entrega de frontend
no repitió toda la ingesta; usó el volumen local real ya restaurado y validado de fase 7.

## Restauración posterior desde un paquete propio

Una vez preparada la base, desde la terminal que apunta al PostgreSQL local:

```powershell
uv run python scripts/demo_bundle.py export
docker compose --env-file .env.docker.example --profile demo run --rm seed
```

El exportado debe realizarse desde la base preparada, antes de querer restaurar una base vacía.
El manifiesto y el paquete son locales e ignorados por Git. `seed` valida el contenido y es idempotente;
no restaura contra un host remoto. Ver [fase 7](phase7.md) y [validación Docker](docker_validation.md).

## Variante Supabase

Se necesita un proyecto propio, PostgreSQL/PostGIS y roles autorizados. Configurar las URLs privadas conforme
a [la guía Supabase](supabase.md). El identificador documentado corresponde al entorno del autor;
un clon no concede acceso a ese proyecto. Los scripts usan SSL y separan usuario de API y migración.
Para el frontend basta cambiar `BACKEND_URL`; no se requieren claves Supabase en el navegador.
