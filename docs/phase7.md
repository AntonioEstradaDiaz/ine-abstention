# Fase 7: integración, validación y demostración reproducible

## Resultado y límites de validación

El backend integra datos oficiales, estadísticas, evaluación de modelos, predicciones,
riesgo y simulaciones. Las rutas pendientes del plan inicial están disponibles:

- `GET /api/v1/territories`: catálogo paginado por año, tipo y entidad; sin año usa el último.
- `GET /api/v1/territories/{id}`: detalle de una instantánea territorial.
- `GET /api/v1/risk/map`: colección de características con predicciones y claves de unión.

Los IDs territoriales corresponden a instantáneas; un municipio no se homologa entre años por
repetir su código. El mapa declara `geometry_status=unavailable`, devuelve `geometry=null`
y entrega `properties.state_code` con dos dígitos para unir cartografía oficial futura.
No es todavía una capa de polígonos dibujable sin otra fuente. Los pronósticos municipales
siguen pendientes de una correspondencia temporal verificada.

Se mantiene el modelo seleccionado y las limitaciones estadísticas de las fases 4–6.
Esta fase no convierte los intervalos empíricos en intervalos con cobertura garantizada,
ni los supuestos aritméticos en evidencia causal.

Verificación realizada: **96 pruebas aprobadas**, 26 comprobaciones HTTP de demostración,
Ruff sin errores y `alembic check` sin operaciones pendientes. La especificación completa
está exportada en `docs/openapi.json` y disponible en `/openapi.json` y `/docs`.

**Docker local validado:** Docker Engine 29.1.3 responde; la imagen se construyó con Python
3.12.15 y los contenedores API/PostgreSQL están saludables. La restauración terminó con
todos los conteos del manifiesto y su repetición devolvió `already_restored`. Se validó
también un arranque desde un volumen nuevo y separado. Las 96 pruebas completas pasaron
contra la base de Docker, además de las 26 comprobaciones HTTP en el puerto 8001.
La variante `compose.supabase.yml` mantiene validación de configuración; el arranque probado
en esta verificación corresponde al entorno local independiente de Supabase.

La reparación de Docker Desktop, las comprobaciones de permisos y los resultados están en
[docker_validation.md](docker_validation.md), `phase7_container_checks.json` y
`phase7_demo_local.json`. El informe consolidado es `phase7_validation.json`.

## Consultas y disponibilidad

La migración `dc97aa094e6f` añade el índice
`territories(territory_type, reference_year, state_code, official_code)`.
El plan real del rol `ine_api`, con RLS activo, utiliza el índice nuevo.

| Consulta de catálogo | Antes, ms | Después, ms |
|---|---:|---:|
| 32 entidades, 2024 | 3.594 | 0.153 |
| Municipios de Morelos, 2024 | 0.384 | 0.089 |

Son mediciones individuales de ejecución PostgreSQL. No incluyen latencia HTTP y pueden
variar por caché, carga y volumen; no constituyen un benchmark de concurrencia ni una garantía.
Los planes con buffers están en `phase7_queries_before.json` y `phase7_queries_after.json`.

Resumen y tendencias ahora trasladan filtros de entidad y fecha de corte a SQL, conservando
las elecciones anteriores necesarias para las comparaciones. Las referencias nacionales
de los indicadores territoriales conservan las 32 entidades, evitando sesgos de filtrado.
Los listados territoriales paginan en la base y la lista de simulaciones omite el JSON grande.

`/health/ready` verifica PostgreSQL, PostGIS y las tablas necesarias del backend. Una conexión
a una base sin migraciones devuelve 503; no se confunde con una API disponible. Una base
migrada vacía puede estar lista técnicamente y devolver 404 en endpoints sin datos.

Para volver a medir:

```powershell
uv run python scripts/benchmark_queries.py
```

## Demostración integral contra Supabase

El `.env` actual contiene las credenciales privadas y no debe sobrescribirse.

```powershell
uv sync --locked --group ml
uv run --group ml alembic upgrade head
uv run --group ml uvicorn app.main:app --host 127.0.0.1 --port 8000
```

En otra terminal:

```powershell
uv run python scripts/demo_backend.py
```

El script ejecuta el recorrido HTTP completo: disponibilidad, fuentes, elecciones, catálogo,
historia, estadísticas, municipios, desgloses, modelos, predicciones, riesgo, mapa y simulación.
Recupera la simulación, repite su creación sin duplicarla y confirma que la predicción no
cambió. Comprueba también errores 422, 404 y la restricción 409 de tendencias municipales.
Falla si una condición no se cumple. Exporta `docs/phase7_demo.json`, con comprobaciones,
tiempos observados, escenario y referencias; no guarda credenciales.

## Imagen y Compose

La imagen usa Python 3.12, `uv==0.11.15` y dependencias de ejecución de `uv.lock` con
`--locked --no-dev --no-editable`. Ejecuta la API con usuario Linux sin privilegios.
No incorpora `.env`, datos, pesos, documentos ni pruebas en el contexto de la imagen.
No se necesitan librerías ML para servir resultados materializados. El reentrenamiento
sigue siendo un flujo separado con `uv sync --group ml` y sus artefactos verificados.

### API contenedorizada sobre Supabase

```powershell
docker compose -f compose.supabase.yml config --quiet
docker compose -f compose.supabase.yml up --build -d
uv run python scripts/demo_backend.py --api-url http://127.0.0.1:8002 --output docs/phase7_demo_container.json
```

La migración recibe únicamente la URL administrativa configurada. El servicio de API recibe
únicamente `DATABASE_URL`, esquema y CORS, sin `MIGRATION_DATABASE_URL`. El puerto predeterminado
es 8002, distinto del servidor local 8000. Docker necesita conectividad hacia PostgreSQL de
Supabase; la conectividad IPv6 del host no demuestra la de la red de contenedores.

### Demostración local independiente de Supabase

Primero exportar el paquete desde la base actual, si todavía no existe:

```powershell
uv run python scripts/demo_bundle.py export
```

Se genera `data/demo/snapshot.jsonl.gz` y `data/demo/manifest.json`. El paquete actual conserva:

| Tabla | Filas |
|---|---:|
| Fuentes | 6 |
| Elecciones | 6 |
| Territorios | 14,971 |
| Participación | 14,971 |
| Desgloses demográficos | 139,653 |
| Versiones de modelos | 6 |
| Corridas predictivas | 1 |
| Predicciones estatales | 32 |

Es una instantánea de agregados oficiales y metadatos congelados, **no datos sintéticos**.
No incluye ZIP originales ni pesos. Las rutas locales de archivos originales se sustituyen
por referencias portables; los checksums oficiales se conservan. No se exportan simulaciones:
se recrean mediante API. El paquete queda fuera de Git; para compartir la demo local deben
acompañarse ambos archivos, o regenerarlos desde la base conectada.

La exportación usa una instantánea transaccional consistente y gzip con fecha fija, JSON
ordenado y manifiesto SHA-256. La restauración comprueba integridad, respeta claves e IDs,
recalcula columnas generadas y ajusta secuencias. Se ejecuta en una transacción.
Se repitió la exportación y se obtuvo el mismo SHA-256:
`c8ffb954d34f1a455a628d1dc811f1557379722cc77625dbea0a4e789398553e`.

Con Docker Desktop disponible:

```powershell
docker compose --env-file .env.docker.example --profile demo config --quiet
docker compose --env-file .env.docker.example build
docker compose --env-file .env.docker.example --profile demo run --rm seed
docker compose --env-file .env.docker.example up -d api
uv run python scripts/demo_backend.py --api-url http://127.0.0.1:8001 --output docs/phase7_demo_local.json
```

La secuencia espera migraciones y restauración antes de usar la demo. El puerto local es
8001 para API y 15432 para PostgreSQL, ambos vinculados a `127.0.0.1`. Se usan credenciales
fijas exclusivamente de desarrollo, definidas en Compose. No se copia ni modifica `.env`.
El servicio `migrate` crea el esquema y el rol limitado `ine_api` antes de aplicar Alembic.
La API no utiliza al superusuario local.

El restaurador solo admite `ENVIRONMENT=local-demo` y un host local. Rechaza una base remota,
un paquete alterado o tablas con datos ajenos al paquete. Si ya se restauró el mismo paquete
y los conteos permanecen iguales, devuelve `already_restored`. No vacía tablas ni reemplaza
datos. Los escenarios posteriores no alteran las tablas verificadas para esa repetición.
El perfil `demo` no descarga ni entrena modelos ni carga datos de prueba inventados.

```powershell
docker compose --env-file .env.docker.example ps
docker compose --env-file .env.docker.example logs api migrate
docker compose --env-file .env.docker.example down
```

`down` conserva el volumen. Un volumen anterior con otra configuración requiere revisión;
los scripts no cambian contraseñas existentes ni lo eliminan automáticamente.

## Validación

```powershell
$env:RUN_INTEGRATION='1'
$env:RUN_ML_INTEGRATION='1'
$env:RUN_FORECAST_INTEGRATION='1'
$env:RUN_SIMULATION_INTEGRATION='1'
uv run --group ml pytest -q
uv run --group ml ruff check .
uv run --group ml ruff format --check .
uv run --group ml alembic check
```

Además de las pruebas existentes, se comprueban catálogo, paginación, detalle, instantáneas
distintas por año, geometrías ausentes explícitas, disponibilidad sin esquema, integridad,
conteos y referencias del paquete exportado, y rechazo de restauración remota o alterada.
La inspección offline del paquete se complementó con restauración real, repetición sin
duplicados y comprobación de secuencias dentro de PostgreSQL/PostGIS en Docker.
