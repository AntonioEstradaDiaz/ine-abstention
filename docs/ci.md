# Verificaciones automáticas

GitHub Actions ejecuta `.github/workflows/tests.yml` en cada push a `main`,
en los pull requests y por ejecución manual.

Los dos jobs usan Ubuntu 24.04, Python 3.12, uv 0.11.15 y las dependencias de
`uv.lock`. El frontend usa Node.js 24 y `npm ci`. Las acciones externas están
fijadas a commits concretos.

- **Backend:** Ruff, pruebas unitarias, ML y todas las familias de integración,
  con advertencias como errores; también comprueba la API real mediante HTTP.
- **Frontend:** pruebas de escenarios ML, compilación, TypeScript y todas las
  pruebas Playwright contra la API real. Las pruebas del asistente simulan Ollama.

Cada job crea su propio PostgreSQL/PostGIS con Docker Compose, aplica las
migraciones y restaura agregados oficiales. No utiliza Supabase, credenciales
de producción ni secretos de GitHub. Los permisos del token son de lectura.
Al finalizar se retiran los servicios y volúmenes del runner temporal.
Los resultados y logs se conservan como artefactos durante siete días;
Playwright añade capturas y trazas de las pruebas fallidas.

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
