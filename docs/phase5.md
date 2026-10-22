# Fase 5: predicciones territoriales, riesgo e incertidumbre

## Escenario materializado

Se generaron y guardaron en Supabase 32 predicciones estatales para el **escenario de elección
intermedia 2027**, usando exclusivamente la instantánea histórica 2009–2024 de la fase 4.
La selección sigue siendo `baseline_last`, experimento `daf97a195864693a644e`. No se volvió
a seleccionar el modelo usando 2024, ni se reentrenaron los candidatos en esta fase.

El estimador conserva la tasa de abstención de la elección anterior del mismo tipo. Para
2027, cada predicción reproduce `NV / (SV + NV)` de 2021 en esa entidad. No estima votos
absolutos: todavía no existe una lista nominal futura incorporada al proyecto.
Los resultados son escenarios analíticos, sin aval de pronóstico oficial del INE.
Los municipios siguen excluidos hasta disponer de correspondencias territoriales temporales.

## Semáforo

La política `historical-terciles-empirical-errors-v1` usa tasas observadas de las 32 entidades
en 2009, 2015 y 2021: 96 observaciones, con el mismo peso para cada entidad y elección.
Calcula los terciles mediante la inversa de la distribución empírica, rango `ceil(n*p)`.
No utiliza predicciones futuras para determinar los umbrales.

| Nivel API | Color previsto | Regla para la tasa de abstención |
|---|---|---|
| `low` | Verde | Menor que 48.12961765326275% |
| `medium` | Amarillo | Desde 48.12961765326275% hasta menos que 56.44145998767056% |
| `high` | Rojo | Desde 56.44145998767056% |

Son posiciones relativas al historial de elecciones comparables, no umbrales normativos
del INE, probabilidades de abstención individual ni recomendaciones de intervención.
La API conserva precisión completa y documenta la regla de igualdad. Con esta política,
2027 tiene 14 entidades de riesgo bajo, 13 medio y 5 alto. Las cinco de nivel alto son
Baja California, Durango, Guanajuato, Quintana Roo y Sonora.

## Incertidumbre y comprobación temporal

Se usa el cuantil empírico 0.90 del error absoluto fuera de tiempo del modelo seleccionado,
separado por tipo de elección. Para 2027 solo está disponible el bloque intermedio 2021:
32 entidades y **una elección**, con radio de **14.368856461187757 puntos porcentuales**.
La banda es `[max(0, predicción-radio), min(1, predicción+radio)]`.

Esta banda es una referencia empírica. **No tiene cobertura del 90% garantizada**:
las entidades comparten choques electorales y no constituyen 32 elecciones independientes.
La API devuelve `coverage_guaranteed=false`, `support=limited` y
`high_risk_probability=null`. No se calcula una probabilidad sin calibración suficiente.
Todas las 32 bandas actuales cruzan algún umbral del semáforo:
`classification_uncertain=true`. El nivel puntual debe leerse junto a esa advertencia.

El diagnóstico cronológico construye cada banda con errores de elecciones anteriores del
mismo tipo, excluyendo los errores del año evaluado. En 2018 y 2021 no existe un bloque
anterior del mismo tipo y la cobertura queda en `null`. Para 2024, la calibración usa
exclusivamente 2018: radio 5.622312544975894 puntos y cobertura observada 26/32 = 81.25%.
Este resultado presidencial no valida la cobertura intermedia 2027. Es un diagnóstico
retrospectivo, no un segundo conjunto de prueba independiente ni una optimización del nivel.
La selección del modelo ya utilizó los cortes de desarrollo 2018 y 2021.

Los errores de 2024 pueden alimentar escenarios presidenciales posteriores cuando se generen,
porque entonces pertenecen al pasado. No se reutilizan para calibrar su propia evaluación.
Si no existen residuos comparables, la política devuelve la banda completa `[0,1]` y
`support=insufficient`, sin sustituir silenciosamente por otro tipo electoral.

## Explicaciones y calidad del dato

La explicación es la identidad matemática del baseline: variable utilizada, año comparable,
fuente, SV y NV. Las tendencias históricas y brechas nacionales aparecen como `context_only`;
no se presentan como contribuciones al estimador ni efectos causales. No se emplea SHAP
para atribuir importancia a variables que este modelo no utiliza.

NS sigue excluido del denominador. Su proporción y los extremos lógicos de abstención en
la elección histórica se muestran por separado de la banda predictiva. La banda no corrige
el sesgo por NS ni las revisiones de datos. Las fechas de publicación histórica aún no
están verificadas; `publication_vintage_verified=false` y `production_ready=false`.

## Persistencia y reproducibilidad

La migración Alembic `b846a3ff1509` añade `forecast_runs` y `territorial_predictions` al
esquema privado configurado. Ambas tablas tienen RLS. `ine_api` recibe únicamente SELECT;
`anon`, `authenticated` y PUBLIC no reciben acceso. El rol de migración registra una corrida
y sus 32 filas en una sola transacción. Los pronósticos no se mezclan con observaciones ni
se añaden elecciones futuras al catálogo histórico.

Antes de deserializar se verifica el SHA-256 de los pesos y el informe contra el registro
de modelos; también se verifican el manifiesto, la instantánea de entrenamiento y la
compatibilidad del código de variables y estimador. Se comprueban los residuos contra la
fórmula temporal del baseline. Un cambio de modelo exige un adaptador de explicaciones
compatible: no se inventan explicaciones para otro estimador.

El identificador deriva del contenido completo, incluyendo política, fuentes, modelo,
predicciones y código de generación. Repetir el mismo escenario conserva el identificador
y no duplica registros. Los pesos solo se cargan en el proceso offline; la API lee resultados.
La conexión de lectura fija `extra_float_digits=3` para conservar la precisión de los
valores double junto a los umbrales JSON, incluso si el servidor configura otra precisión.

```powershell
uv sync --group ml
uv run --group ml alembic upgrade head
uv run --group ml python scripts/generate_predictions.py --target-year 2027 --election-type midterm --model-run daf97a195864693a644e --register
```

Sin `--register` se generan los archivos locales, sin escribir predicciones en Supabase.
Los artefactos completos quedan en `artifacts/predictions/<id>/`; el informe revisable está
en `docs/phase5_results.json` y las 32 tasas en `data/samples/territorial_predictions.csv`.

## API

Las tasas `predicted`, `lower`, `upper` y los umbrales son fracciones en `[0,1]`.
Los campos que terminan en `_pp` expresan puntos porcentuales.

- `GET /api/v1/predictions`: listado paginado con metadatos de escenario, bandas y explicación.
- `GET /api/v1/predictions/{territory_id}`: detalle usando el ID devuelto por el listado.
- `GET /api/v1/risk/calibration`: política, fuentes y diagnóstico cronológico.
- `GET /api/v1/risk/summary`: conteos por nivel y clasificaciones inciertas.

Las cuatro rutas admiten `target_year` y `run_id`. Sin ellos se consulta el último escenario
2027 materializado. Un `run_id` explícito recupera esa corrida; si además se proporciona
`target_year`, debe coincidir. Un año no generado devuelve 404. El listado añade filtros
`state_code` (`01`–`32`), `risk_level` (`low`, `medium`, `high`), `limit` (1–100) y `offset`.

```powershell
Invoke-RestMethod 'http://127.0.0.1:8000/api/v1/predictions?state_code=01'
Invoke-RestMethod 'http://127.0.0.1:8000/api/v1/predictions/12463'
Invoke-RestMethod 'http://127.0.0.1:8000/api/v1/risk/calibration?target_year=2027'
Invoke-RestMethod 'http://127.0.0.1:8000/api/v1/risk/summary'
```

La geometría estatal y las simulaciones de intervención permanecen pendientes de fases posteriores.

## Verificación

```powershell
$env:RUN_INTEGRATION='1'
$env:RUN_ML_INTEGRATION='1'
$env:RUN_FORECAST_INTEGRATION='1'
uv run --group ml pytest -q
uv run --group ml ruff check .
uv run --group ml ruff format --check .
uv run --group ml alembic check
```

Las pruebas verifican cortes de calibración, cuantiles, igualdad en umbrales, falta de
residuos, bandas, filtros, trazabilidad, reproducción de inferencia con pesos registrados,
rechazo de hashes alterados y permisos de lectura sin escritura para el rol de la API.
