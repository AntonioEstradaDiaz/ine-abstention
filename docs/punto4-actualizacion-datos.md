# Punto 4 · Incorporar una nueva elección (Atlas De La Participación · Equipo Pumpkin)

Guía para agregar los Conteos Censales de Participación Ciudadana (CCPC) de una elección nueva,
por ejemplo **2027**, cuando el INE los publique. El INE los publica después de cada elección
federal, así que los de 2027 no existirán antes de 2028.

El detalle técnico de la ingesta está en [`phase2.md`](phase2.md). Esta guía ordena los pasos y
agrega lo necesario para que la app muestre la versión de los datos ("Versión de los datos" en
Gestión de Datos).

## Antes de empezar

- **Quién:** una persona con acceso a Supabase. El `.env` local (ignorado por Git) debe tener
  `DATABASE_URL` y `MIGRATION_DATABASE_URL` (ver [`supabase.md`](supabase.md)).
- **Herramientas:** `uv` y Python 3.12, y Node para el frontend.
- **Rama nueva** desde `main`, por ejemplo `data/ccpc-2027`.
- Ningún paso edita a mano los CSV del INE. Si algo no cuadra, se detiene y se documenta.

## Pasos

### 1. Registrar la fuente y la fecha de la jornada

- En `pipelines/ingestion/sources.json`, agregar `{"year": 2027, "url": "<URL del ZIP en ine.mx>"}`.
- En `pipelines/transformation/ccpc.py`, agregar a `DATES` la fecha oficial de la jornada electoral,
  según la publicación del INE. La validación rechaza filas con otra fecha.

### 2. Descargar e inventariar

```powershell
uv run python scripts/inspect_ccpc.py 2027
```

Descarga el ZIP a `data/raw/ccpc/2027/` y registra su SHA-256 y contenido. No modifica Supabase.

### 3. Validar y preparar

```powershell
uv run python scripts/prepare_ccpc.py 2027
```

Valida claves, conteos, fechas, duplicados y categorías, y escribe los agregados en
`data/processed/ccpc/2027/`. No modifica Supabase.

**Si falla (`DataQualityError`):** no cargar nada.

1. Revisar el reporte de calidad `data/processed/ccpc/2027/quality.json`: queda con `"status": "rejected"`,
   el error y el archivo del ZIP donde ocurrió.
2. Comprobar si cambió el formato del INE (columnas nuevas, otra clave de distrito, otra fecha).
3. Documentarlo en un issue con el mensaje y el reporte.
4. Ajustar el procesamiento solo con una nueva versión (por ejemplo `ccpc-v2` en `PIPELINE_VERSION`),
   revisada en un PR. Nunca corregir ni descartar filas en silencio.

### 4. Cargar en Supabase

```powershell
uv run alembic upgrade head
uv run python scripts/load_ccpc.py 2027
```

Es una transacción por elección: si falla, no queda nada a medias. Una fuente ya cargada con el
mismo SHA-256 y versión se omite (`skipped`).

### 5. Actualizar la muestra estatal

```powershell
uv run python scripts/report_ccpc.py
```

Regenera `data/samples/ccpc_states.csv` con la nueva elección.

### 6. Exportar el paquete y el manifiesto de fuentes

```powershell
uv run python scripts/demo_bundle.py export
uv run python scripts/export_source_provenance.py
```

- `data/demo/` (paquete de demo) **no** se versiona.
- `data/samples/ccpc_sources.json` **sí** se versiona: es la procedencia que muestra la app
  (huella, fechas, validación y versión del procesamiento, sin rutas locales).

### 7. Regenerar la copia de la demo

```powershell
uv run python scripts/build_web_preview.py
```

Actualiza `frontend/src/lib/preview-data.json`, que es lo que usa la demo de Vercel. Revisar el diff
antes de seguir.

### 8. Ajustar lo que asume seis elecciones

Varias partes del código suponen las seis elecciones de 2009 a 2024. Revisarlas en el mismo PR:

| Archivo | Qué asume |
|---------|-----------|
| `app/api/v1/data.py` | `year` con `le=2024` en el historial |
| `app/ml/laboratory.py` | Exactamente los años 2009–2024 y 192 observaciones |
| `tests/integration/test_database.py`, `tests/integration/test_model_registry.py` | 6 fuentes y 6 elecciones |
| `scripts/check_web_preview.py`, `scripts/demo_backend.py` | 6 elecciones y 6 fuentes |
| `frontend/tests/data-provenance.spec.ts` | 6 elecciones + cartografía (7 filas) |

**Predicción:** con 2027 cargado, el pronóstico de 2027 deja de ser un pronóstico. Reentrenar los
modelos y definir la siguiente predicción es un trabajo aparte, fuera de esta guía (ver
[`phase4.md`](phase4.md) y [`phase5.md`](phase5.md)). `build_web_preview.py` arma hoy la predicción
2027 y puede necesitar cambios en ese trabajo.

### 9. Verificar

```powershell
uv run ruff check app pipelines scripts tests
uv run pytest
$env:RUN_INTEGRATION = '1'; uv run pytest; Remove-Item Env:RUN_INTEGRATION
```

```powershell
cd frontend
npm run typecheck
npm run test:unit
npm run build
```

Las pruebas de navegador completas corren en el CI del PR.

### 10. Comprobar en la app y abrir el PR

En Gestión de Datos → **Versión de los datos**:

- Aparece una fila para 2027 con la fecha del archivo en el sitio del INE, la fecha de consulta,
  "Validado" y la versión del procesamiento.
- "Datos consultados" (encabezado) muestra la fecha de la consulta nueva.
- "Descargar manifiesto" incluye la nueva fuente con su huella SHA-256 completa.

Abrir el PR con los archivos versionados (`sources.json`, `ccpc.py` si cambió, `ccpc_states.csv`,
`ccpc_sources.json`, `preview-data.json` y los ajustes del paso 8) y el resultado de las pruebas.
