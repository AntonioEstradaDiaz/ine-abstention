# Verificaciones automáticas

GitHub Actions ejecuta `.github/workflows/tests.yml` en cada push a `main`,
en los pull requests y por ejecución manual.

Los dos jobs usan Ubuntu 24.04, Python 3.12, uv 0.11.15 y las dependencias de
`uv.lock`. El frontend usa Node.js 24 y `npm ci`. Las acciones externas están
fijadas a commits concretos.

- **Backend:** Ruff, pruebas unitarias, ML y todas las familias de integración,
  con advertencias como errores; también comprueba la API real mediante HTTP.
- **Frontend:** pruebas unitarias de escenarios ML, Groq y Gemini, compilación,
  TypeScript y todas las pruebas Playwright contra la API real. Las pruebas
  del asistente simulan Groq, Gemini y Ollama, sin utilizar claves reales.

La rama con Supabase Auth configura el frontend de CI contra una fixture Auth local en
`127.0.0.1:54321`, iniciada por Playwright. Una preparación de sesión utiliza el login real
de la aplicación y guarda cookies para las pruebas del dashboard. Se prueban además acceso
anónimo, credenciales incorrectas, cierre de sesión y cookies manipuladas. La aplicación
mantiene sus verificaciones de usuario; CI no las desactiva. Ver [AUTH.md](../frontend/AUTH.md)
para reproducir esta ejecución y sus límites frente a un proyecto Supabase real.

Cada job crea su propio PostgreSQL/PostGIS con Docker Compose, aplica las
migraciones y restaura agregados oficiales. No utiliza Supabase, credenciales
de producción ni secretos de GitHub. Los permisos del token son de lectura.
Al finalizar se retiran los servicios y volúmenes del runner temporal.
Los resultados y logs se conservan como artefactos durante siete días;
Playwright añade capturas y trazas de las pruebas fallidas.

`main` exige pull request y los checks `Backend (unit, ML, integration)` y
`Frontend (ML, types, build, browser)` emitidos por GitHub Actions. La rama del PR
debe estar al día con `main`. La protección también se aplica a administradores;
no exige una aprobación humana adicional. Si cambian los nombres de esos jobs,
deben actualizarse también los checks obligatorios en la configuración de GitHub.

## Datos y modelos reproducibles

`tests/fixtures/ci.tar.gz` contiene los agregados oficiales anonimizados de la
demo y los artefactos congelados que verifican las pruebas de inferencia.
No contiene ZIP originales, secretos, simulaciones ni una copia de `.env`.
El paquete conserva los IDs, predicciones y hashes de los informes registrados.
No sustituye datos reales por registros fabricados para hacer pasar pruebas.

El archivo `.sha256` verifica su integridad antes de restaurarlo. El restaurador
rechaza rutas ajenas a los directorios de datos/modelos, enlaces y archivos
existentes con contenido distinto. No deserializar modelos de procedencia ajena.

```powershell
uv run --locked python scripts/ci_fixtures.py restore
```

Para actualizar deliberadamente los datos congelados, primero validar los
informes, modelos y paquete local, y después generar el archivo reproducible:

```powershell
uv run --locked python scripts/ci_fixtures.py pack
```

El paquete y su SHA-256 deben revisarse juntos. Los cambios de código que
invaliden los hashes de los modelos requieren revisar su compatibilidad;
CI conserva esa comprobación. `.gitattributes` mantiene las fuentes Python
con saltos de línea LF para no cambiar esos hashes entre Windows y Linux.

## Ejecución local en Windows

Desde la raíz, usar carpetas del repositorio si el entorno restringe el acceso a la caché
de uv o al directorio temporal del usuario:

```powershell
$env:UV_CACHE_DIR = Join-Path (Get-Location) 'tmp/uv-cache'
uv sync --locked --group ml
uv run --locked pytest tests/unit tests/ml -q -W error --basetemp=tmp/pytest-backend
uv run --locked ruff check app pipelines scripts tests
uv run --locked ruff format --check app pipelines scripts tests
```

`tmp/` está ignorado por Git. Reservar `tmp/pytest-backend` exclusivamente para pytest:
`--basetemp` limpia su contenido al comenzar cada ejecución. No ejecutar dos sesiones sobre la misma carpeta.
Si el entorno virtual ya está preparado, `.\.venv\Scripts\python.exe -m pytest` permite
ejecutar las mismas opciones sin consultar la caché de uv.

Un error al crear `pytest-of-<usuario>` ocurre antes de ejecutar el test y no demuestra un fallo
de la API. No ocultarlo con skips ni desactivar validaciones; corregir la ruta de temporales.
Las pruebas de integración necesitan PostgreSQL/PostGIS, migraciones, datos y modelos restaurados.
Activar `RUN_INTEGRATION`, `RUN_ML_INTEGRATION`, `RUN_FORECAST_INTEGRATION` y
`RUN_SIMULATION_INTEGRATION` con valor `1` para ejecutar todas sus familias, como hace CI.

Para comprobar la base Docker local ya preparada, ejecutar en una terminal dedicada desde la raíz.
Estas variables solo afectan esa terminal y no modifican el `.env` de Supabase:

```powershell
docker compose --env-file .env.docker.example up -d --wait api
$env:DATABASE_URL = 'postgresql+psycopg://ine_api:ine_api_local@127.0.0.1:15432/ine_abstention'
$env:MIGRATION_DATABASE_URL = 'postgresql+psycopg://ine_owner:ine_owner_local@127.0.0.1:15432/ine_abstention'
$env:DATABASE_SCHEMA = 'ine'
$env:ENVIRONMENT = 'local-demo'
$env:RUN_INTEGRATION = '1'
$env:RUN_ML_INTEGRATION = '1'
$env:RUN_FORECAST_INTEGRATION = '1'
$env:RUN_SIMULATION_INTEGRATION = '1'
.\.venv\Scripts\python.exe -m pytest tests/integration -q -W error --basetemp=tmp/pytest-integration --junitxml=tmp/integration.xml
.\.venv\Scripts\python.exe scripts/demo_backend.py --api-url http://127.0.0.1:8001 --output tmp/integration-http.json
```

En un clon nuevo, primero preparar el entorno y restaurar la demo según [installation.md](installation.md).
Las pruebas de simulaciones crean registros locales persistidos; no ejecutarlas contra una base de producción.

### Verificación local del 25 de octubre de 2026

Con Python 3.13.4 y el entorno virtual existente, la primera ejecución terminó con **91 pruebas
aprobadas y 18 de integración omitidas** mediante `pytest -q -W error` y una carpeta `--basetemp`
dentro de `tmp/`. Ruff y la comprobación de formato también pasaron.

Después de iniciar Docker Desktop y los servicios locales existentes, se ejecutaron las **18 pruebas
de integración: todas aprobadas, sin omisiones**, con advertencias como errores, en 43.66 segundos.
El recorrido HTTP contra `http://127.0.0.1:8001` también pasó sus **26 comprobaciones**.
Se conservó el volumen existente; no fue necesario restaurar datos ni cambiar código del backend.
Los resultados de esta ejecución quedan en `tmp/integration-review.xml` y `tmp/integration-http-review.json`
(archivos locales ignorados por Git). PostgreSQL y la API quedaron activos y saludables.

El primer intento falló al crear temporales del usuario; al cambiar de carpeta se resolvió ese
error. El entorno aislado también bloqueó la ejecución de TestClient; la suite pasó al ejecutarse
fuera de ese aislamiento. No se modificaron rutas, modelos ni reglas de negocio para obtener el resultado.

### Verificación después de actualizar main

Tras incorporar `c2e2ab3` (rediseño de Datos/Reportes, mapa compartido y fuentes locales),
se volvió a validar el árbol con las correcciones de documentación:

- Backend completo: **109 pruebas aprobadas, sin omisiones**, con `-W error`, en 45.61 segundos.
- Ruff y formato: correctos.
- Frontend: **9 pruebas unitarias aprobadas** y compilación de producción con TypeScript correcta.
- Playwright contra la compilación de producción en `127.0.0.1:3001` y la API Docker en
  `127.0.0.1:8001`: **16 pruebas aprobadas**, incluidas las nuevas pantallas de Datos y Reportes.
- Recorrido HTTP: **26 comprobaciones aprobadas**.

Los informes locales son `tmp/post-update-tests.xml`, `tmp/post-update-http.json` y
`frontend/test-results/results.json`; están ignorados por Git. Las pruebas del asistente
simulan los proveedores y no acreditan disponibilidad ni cuota de las API externas.
