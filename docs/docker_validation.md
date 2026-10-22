# Validación real de Docker Compose

## Reparación de Docker Desktop

Docker Desktop 4.57.0 quedaba atascado con el motor detenido. El registro de arranque
identificó dos endpoints AF_UNIX inaccesibles para Windows:

- `%LOCALAPPDATA%\Docker\run\dockerInference`.
- `%LOCALAPPDATA%\docker-secrets-engine\engine.sock`.

El backend fallaba al intentar abrirlos o eliminarlos y dejaba un proceso de diagnóstico
que impedía los siguientes arranques. WSL respondía y su distribución Docker estaba detenida.
Se detuvieron los procesos de Docker Desktop, se verificó que esas carpetas solo contenían
endpoints temporales de cero bytes y se apartaron sus directorios con nombres recuperables:

- `%LOCALAPPDATA%\Docker\run.recovery-20261021-215155`.
- `%LOCALAPPDATA%\Docker\run.recovery-20261021-215323`.
- `%LOCALAPPDATA%\docker-secrets-engine.recovery-20261021-215323`.

Se recrearon los directorios de ejecución y Docker Desktop inició correctamente, con
**Docker Engine 29.1.3**. Se conservaron discos WSL, imágenes, volúmenes y configuración.
Las carpetas recuperables permanecen en su ubicación; no se deben volver a colocar sus
sockets obsoletos dentro de los directorios activos.

Esta recuperación se verificó con el daemon funcionando. Si un apagado no limpio vuelve
a dejar endpoints inaccesibles, el registro permite reconocer el mismo fallo. La guía de
[diagnóstico de Docker](https://docs.docker.com/desktop/troubleshoot-and-support/troubleshoot/)
explica la ubicación de los registros. No se necesita restablecer toda la instalación para
repetir esta recuperación puntual de endpoints, previa comprobación de su contenido.

## Ajustes encontrados al ejecutar Compose

1. El puerto 5433 estaba ocupado por un servicio existente. PostgreSQL de esta demo usa ahora
   **127.0.0.1:15432**, sin detener el otro servicio. La API utiliza **127.0.0.1:8001**.
2. La comprobación inicial de disponibilidad usaba el socket Unix de PostgreSQL. Durante
   una inicialización nueva podía aceptar conexiones antes de que el servidor TCP estuviera
   disponible para la migración. El healthcheck usa ahora `pg_isready -h 127.0.0.1`.
3. Las pruebas de permisos ahora verifican privilegios de roles por sus OID si existen.
   Esto conserva las comprobaciones de Supabase y permite probar PostgreSQL local, donde
   los roles `anon` y `authenticated` no existen. Un rol inexistente no recibe acceso.

## Evidencia verificada

- Construcción completa de las imágenes API, migración y restaurador con `uv.lock`.
- Python 3.12.15 sobre Linux; usuario de API UID 1000.
- `.env` ausente de la imagen y URL administrativa ausente del proceso de API.
- PostgreSQL/PostGIS y API en estado saludable.
- Migraciones completadas y `alembic check` sin operaciones pendientes.
- Primera restauración: `restored`; segunda restauración: `already_restored`.
- 14,971 territorios, 14,971 registros de participación y 139,653 desgloses restaurados.
- Seis fuentes, seis elecciones, seis versiones de modelos, una corrida y 32 predicciones.
- Secuencias de las siete tablas con identidad ajustadas a sus IDs máximos.
- RLS activo en todas las tablas de aplicación. El rol `ine_api` carece de superusuario y
  bypass de RLS, lee predicciones sin poder modificarlas y solo inserta en simulaciones.
- **96 pruebas aprobadas contra PostgreSQL de Docker**, con las cuatro familias de integración activas.
- **26 comprobaciones HTTP aprobadas** en la API contenedorizada, repetidas correctamente.
- La simulación integrada conserva el ID
  `225cfc40ad0579ed72bed5571efe3d7f5f4a09e164c6eef8532287d246c17eb1`, igual que en Supabase.

La imagen de API validada es:
`sha256:f02368c0a388e9b6862a02c84d5a02646014939af98812fe4cca37f089d0f4cc`.

El paquete restaurado conserva el SHA-256:
`c8ffb954d34f1a455a628d1dc811f1557379722cc77625dbea0a4e789398553e`.

Se comprobó también el arranque desde cero con un volumen independiente del proyecto
`ine-abstention-cold-check`, usando temporalmente el puerto 15433. La migración y restauración
finalizaron sin la carrera de disponibilidad. Después se retiraron esos contenedores y su
red, conservando el volumen auxiliar. La demo principal permanece en ejecución.

Los informes legibles por máquinas son:

- `phase7_validation.json`: estado consolidado y resultados Docker.
- `phase7_container_checks.json`: conteos, rol, RLS y privilegios reales del contenedor.
- `phase7_demo_local.json`: las 26 comprobaciones HTTP y el escenario reproducido.

## Repetición

```powershell
docker compose --env-file .env.docker.example --profile demo build
docker compose --env-file .env.docker.example --profile demo run --rm seed
docker compose --env-file .env.docker.example up -d --wait --wait-timeout 90 api
uv run python scripts/demo_backend.py --api-url http://127.0.0.1:8001 --output docs/phase7_demo_local.json
docker compose --env-file .env.docker.example run --rm --no-deps migrate alembic check
```

Para repetir las pruebas desde PowerShell contra la base de demostración:

```powershell
$env:DATABASE_URL='postgresql+psycopg://ine_api:ine_api_local@127.0.0.1:15432/ine_abstention'
$env:MIGRATION_DATABASE_URL='postgresql+psycopg://ine_owner:ine_owner_local@127.0.0.1:15432/ine_abstention'
$env:DATABASE_SCHEMA='ine'
$env:ENVIRONMENT='local-demo'
$env:RUN_INTEGRATION='1'
$env:RUN_ML_INTEGRATION='1'
$env:RUN_FORECAST_INTEGRATION='1'
$env:RUN_SIMULATION_INTEGRATION='1'
uv run --group ml pytest -q
```

Las credenciales mostradas son exclusivamente las de la demo local. Estas variables afectan
la terminal actual; cerrar esa terminal permite volver a cargar la configuración habitual
sin modificar el archivo `.env` de Supabase. La evaluación ML completa requiere también los
artefactos locales de la fase 4; las imágenes de servicio no necesitan deserializarlos.

Esta validación corresponde a Compose local. `compose.supabase.yml` continúa con su
configuración validada; no se arrancó otra API contenedorizada contra Supabase en esta prueba.
Las geometrías oficiales permanecen fuera del paquete y `/risk/map` lo declara explícitamente.
