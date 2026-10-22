# Fase 3: estadística descriptiva territorial

## Alcance y fuentes

Esta fase calcula indicadores a partir de las observaciones CCPC ya cargadas en Supabase.
No modifica los conteos originales ni crea predicciones. La API usa el rol de solo lectura.
No necesita migraciones de base de datos ni nuevas dependencias.

Fuentes y restricciones de los archivos: `docs/phase2.md` y `docs/data_inventory.json`.
Resultados calculados: `docs/phase3_results.md` y `docs/phase3_statistics.json`.
Exportación de los 192 registros estatales: `data/samples/ccpc_state_statistics.csv`.

Las claves municipales no se han homologado entre años. Por eso se calculan tendencias para
entidades federativas y para el agregado nacional. Los municipios conservan indicadores del
año consultado y diferencias respecto a su estado y al país. No se presentan series municipales
como si se hubieran demostrado equivalencias territoriales.

## Indicadores y denominadores

Se usan los conteos `SV` (votaron), `NV` (no votaron), `NS` (sin información) y `LN` (lista nominal).
Se mantiene la identidad validada `LN = SV + NV + NS`.

| Indicador de API | Definición |
| --- | --- |
| `participation_rate` | `SV / (SV + NV)` |
| `abstention_rate` | `NV / (SV + NV)` |
| `unspecified_rate` | `NS / LN` |
| `known_participation_count` | `SV + NV` |
| `known_participation_fraction` | `(SV + NV) / LN` |
| `missing_data_abstention_lower` | `NV / LN`: todos los registros NS habrían votado |
| `missing_data_abstention_upper` | `(NV + NS) / LN`: todos los registros NS se habrían abstenido |
| `participation_change_pp` | `100 × (participación actual − participación anterior comparable)` |
| `abstention_change_pp` | `100 × (abstención actual − abstención anterior comparable)` |
| `gap_vs_national_abstention_pp` | `100 × (abstención territorial − abstención agregada del país)` |
| `gap_vs_state_abstention_pp` | `100 × (abstención municipal − abstención agregada de su estado)` |

Las tasas son fracciones entre 0 y 1. Cambios y brechas se expresan en puntos porcentuales.
Los dos límites de información faltante son extremos aritméticos, no intervalos de confianza
ni intervalos predictivos. Cuando el denominador es cero se devuelve `null`, no cero ni una
predicción. `NS` no se transforma en abstención.

Para agregar territorios se suman primero los conteos y después se calcula la tasa. No se
promedian porcentajes estatales o municipales. El país se calcula exclusivamente desde las
entidades: añadir sus municipios duplicaría la población. Los desgloses demográficos también
se agregan desde las entidades y consultan una sola dimensión cada vez.

## Comparaciones temporales

Las elecciones se separan en dos series:

- Presidenciales: 2012, 2018 y 2024.
- Intermedias: 2009, 2015 y 2021.

El cambio de 2024 se calcula respecto de 2018, no de 2021. El de 2021 se calcula respecto de 2015.
El primer dato disponible de cada tipo no tiene cambio previo. Filtrar un año en el resumen no
elimina su referencia anterior: la comparación se calcula antes de filtrar la respuesta.

`through_year` excluye las observaciones posteriores del cálculo de tendencias. Los indicadores
de un año histórico también usan únicamente elecciones del mismo tipo hasta ese año, incluido.
Estas medias son descripciones hasta el año consultado; para construir predictores de una elección
futura habrá que aplicar los desfases correspondientes, sin incluir la elección objetivo.

## Medias, variabilidad y tendencias

`history` y `metrics` describen la serie temporal comparable:

- `mean_abstention_rate` y `mean_participation_rate`: media aritmética de las tasas por elección.
- `pooled_abstention_rate` y `pooled_participation_rate`: tasa de los conteos sumados entre elecciones.
  Esta medida pondera por el número de registros de participación conocida de cada elección.
- `abstention_sample_std_pp`: desviación estándar muestral, con divisor `n − 1`, en puntos porcentuales.
  Se requiere al menos dos elecciones válidas. La participación tiene la misma desviación estándar.
- `abstention_slope_pp_per_year`: pendiente de mínimos cuadrados ordinarios de abstención frente al año
  calendario, multiplicada por 100. Se requieren al menos tres elecciones comparables con tasa válida.
- `participation_slope_pp_per_year`: la pendiente anterior con signo opuesto.
- `linear_fit_r_squared`: ajuste de la recta a esos mismos datos; no es validación predictiva.
- `direction`: aumento de abstención, disminución de abstención o serie plana. Es descriptiva y no implica
  significancia estadística. Una tolerancia numérica de `1e-12` pp/año identifica una pendiente nula.

Una serie constante tiene pendiente cero y `R²=null`, porque no existe variación que explicar.
Las observaciones con denominador cero se excluyen del ajuste y de las medias, pero permanecen en
la respuesta con su tasa nula. Se informa tanto el total observado como el número de tasas válidas.
Si el dato comparable anterior tiene denominador cero, el cambio se devuelve nulo.

Solo existen tres elecciones por tipo en el conjunto actual. No se presentan pruebas de significancia,
intervalos de regresión, pronósticos ni relaciones causales. La variación de `NS`, la cobertura de los
cuadernillos y las restricciones cartográficas siguen afectando la interpretación.

## Persistencia de baja participación

`persistent_low_participation=true` identifica una entidad cuya participación observada fue
estrictamente menor al agregado nacional en **cada una de las tres últimas elecciones disponibles
del mismo tipo**, hasta el año consultado. Equivale a tener una abstención mayor al referente
nacional en las tres ocasiones. No se usan los umbrales ilustrativos del futuro semáforo de riesgo.

- `true`: cumple las tres comparaciones.
- `false`: hay tres comparaciones válidas y alguna no cumple.
- `null`: faltan elecciones válidas, la referencia nacional no tiene las 32 entidades o el territorio
  es municipal y requiere homologación.

`above_national_in_last_three` informa cuántas de las tres elecciones superan la abstención nacional.
La persistencia es relativa a un referente observado; no afirma abstención futura ni causas del fenómeno.

## API

Todas las rutas están bajo `/api/v1/statistics`. Los resultados incluyen `methodology_version=descriptive-v1`,
denominador, unidades y significado de los límites por información faltante.

| Método y ruta | Parámetros principales | Resultado |
| --- | --- | --- |
| `GET /summary` | `year`, `state_code` | Totales nacionales o de una entidad, tasas y cambios comparables |
| `GET /trends` | `state_code`, `election_type`, `through_year` | Series separadas por tipo electoral y sus indicadores históricos |
| `GET /territories` | `year`, `territory_type`, `state_code`, `sort_by`, `limit`, `offset` | Indicadores estatales o instantáneas municipales, paginados |
| `GET /demographics` | `dimension`, `year`, `state_code` | Conteos y tasas por sexo, banda de edad o tipo de sección |

Si falta `state_code`, los resúmenes y tendencias son nacionales. En territorios y demografía,
`year` toma por defecto el último año observado. Solo se aceptan los seis años cargados. Los códigos
de entidad usan dos dígitos. La paginación admite de 1 a 500 filas. No se devuelve información ficticia
si la base o una selección está vacía: la API responde 404.

`sort_by` admite `abstention_desc`, `participation_desc`, `abstention_change_desc` y `trend_desc`.
Los valores nulos se ordenan al final y los empates por clave territorial. Para municipios se rechazan
los órdenes por tendencia o cambio con 409; su `history`, cambios temporales y persistencia son nulos.

`dimension` admite `sex`, `age_band` o `section_type`. No se suman entre sí ni se interpretan como
cruces de variables. Las categorías se conservan como en la fuente: sexo `0` hombres, `1` mujeres y
`2` no binario; tipo de sección `U` urbana, `M` mixta, `R` rural; bandas de edad `18-24`, `25-34`,
`35-44`, `45-59` y `60+`. La categoría no binaria solo está disponible en 2024; no se imputa a otros años.
`territory_count` en un desglose indica entidades con esa categoría presente, no registros individuales.

Los errores de base de datos devuelven 503 sin exponer credenciales ni sentencias. Una duplicidad
de versiones de fuente para una entidad y un año genera 409, evitando sumar dos veces la misma
población. Los filtros no válidos devuelven 422.

Ejemplos:

```text
/api/v1/statistics/summary?year=2024
/api/v1/statistics/trends?state_code=17&election_type=presidential
/api/v1/statistics/trends?through_year=2018
/api/v1/statistics/territories?year=2024&sort_by=trend_desc
/api/v1/statistics/territories?territory_type=municipality&state_code=17&year=2024
/api/v1/statistics/demographics?dimension=age_band&year=2024
```

## Ejecución y verificación

```powershell
uv run uvicorn app.main:app --host 127.0.0.1 --port 8000
uv run python scripts/report_statistics.py
uv run ruff check .
uv run ruff format --check .
uv run pytest
$env:RUN_INTEGRATION = '1'
uv run pytest
Remove-Item Env:RUN_INTEGRATION
```

Las pruebas unitarias usan casos sintéticos identificados como tales: conteos ponderados, datos
desconocidos, cambios comparables, cortes temporales, pendientes, variabilidad y persistencia.
Las pruebas de integración cotejan el resumen nacional con el reporte independiente de ingesta,
verifican que cada margen demográfico reconcilie con los totales y consultan los datos reales con
el rol de lectura. También comprueban que municipios, filtros inválidos y datos ausentes no
produzcan indicadores históricos falsos.
