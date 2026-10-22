# Base de datos de Supabase

Proyecto: `ine-abstention` (`npzgdyyzdcsdadtfxhmr`), organización `AntonioEstradaDiaz`.
Región: `us-east-1`. Creado en plan Free con costo cotizado de 0 al mes.

## Arquitectura

FastAPI se ejecuta localmente. PostgreSQL y PostGIS se alojan en Supabase.
No se necesita Docker para este modo de ejecución.

- `ine`: esquema privado de la aplicación, fuera de los esquemas expuestos por la Data API.
- `gis`: extensión PostGIS y sus funciones.
- `ine_api`: usuario de ejecución con políticas de solo lectura sobre las tablas CCPC.
- `ine_migrator`: usuario propietario de las tablas, con permiso para crear objetos y ejecutar la ingesta en `ine`.

Las contraseñas aleatorias están únicamente en `.env`, ignorado por Git. El archivo contiene
`DATABASE_URL` y `MIGRATION_DATABASE_URL`, ambas con SSL obligatorio (`sslmode=require`).
No requiere claves `anon` ni `service_role`: SQLAlchemy usa el protocolo PostgreSQL.
No publicar `.env` ni compartir su contenido en capturas o registros.

La conexión directa usa IPv6. Si cambias a una red sin IPv6, copia el host del
**Session pooler** desde Connect en el dashboard. Usa puerto 5432 y el usuario
`ine_api.npzgdyyzdcsdadtfxhmr` para la API o `ine_migrator.npzgdyyzdcsdadtfxhmr`
para migraciones, conservando las contraseñas y SSL. No usar el pooler de transacciones
para este arranque sin ajustar las sentencias preparadas del driver.

## Ejecutar

No sobrescribir el `.env` ya configurado con `.env.example`.

```powershell
uv sync --locked
uv run alembic upgrade head
uv run uvicorn app.main:app --host 127.0.0.1 --port 8000
```

API: http://localhost:8000/docs. Conexión: http://localhost:8000/api/v1/health/ready.

```powershell
$env:RUN_INTEGRATION = '1'
uv run pytest
Remove-Item Env:RUN_INTEGRATION
```

Alembic administra las tablas del dominio dentro de `ine`. El aprovisionamiento inicial de
roles, esquema y PostGIS se registra en las migraciones administrativas de Supabase.
No modificar tablas de `auth`, `storage` ni otros esquemas administrados. Si posteriormente
se expone `ine` a la Data API, definir explícitamente sus permisos y políticas RLS.

La ingesta y las fuentes oficiales se documentan en `docs/phase2.md`. Las pruebas de integración
de ingesta requieren las seis elecciones cargadas. Las tablas CCPC tienen RLS habilitado;
la carga usa el propietario y las consultas de FastAPI usan el usuario de lectura.

`ine.model_versions` conserva las versiones y métricas del entrenamiento de fase 4, también
con RLS y acceso de solo lectura desde la API. Los archivos de pesos permanecen localmente en
`artifacts/models/<run_id>/`; Supabase conserva rutas y SHA-256, no los objetos serializados.

Documentación oficial:
- https://supabase.com/docs/guides/database/connecting-to-postgres
- https://supabase.com/docs/guides/database/extensions/postgis
