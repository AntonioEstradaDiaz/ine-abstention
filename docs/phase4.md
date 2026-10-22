# Fase 4: variables históricas y validación temporal

## Resultado y alcance

Se entrenaron y compararon dos referencias históricas y cuatro modelos: Ridge, Random Forest,
XGBoost y LightGBM. La unidad de análisis es la entidad federativa. Los municipios siguen excluidos
porque sus claves y límites no están homologados entre elecciones.

Los resultados completos están en `docs/phase4_results.md` y `docs/phase4_metrics.json`.
`data/samples/ccpc_model_comparison.csv` contiene la comparación; `ccpc_backtest_errors.csv`
conserva los 576 errores fuera de tiempo: seis modelos × tres elecciones × 32 entidades.

El baseline de última elección comparable quedó seleccionado por desarrollo. LightGBM obtuvo el
menor MAE en 2024, pero no se modifica la selección después de observar esa prueba. Los modelos
permanecen experimentales; esta fase no implementa pronósticos futuros ni intervalos predictivos.

## Datos y elegibilidad

Se usan las 192 observaciones estatales CCPC y sus márgenes demográficos agregados, extraídos del
esquema privado `ine`. La etiqueta es la abstención observada `NV/(SV+NV)`. `NS` se conserva como
información no especificada, sin convertirlo en abstención ni imputar etiquetas.

Cada ejemplo exige una elección previa del mismo tipo. Se obtienen 128 ejemplos supervisados:
32 entidades en 2015, 2018, 2021 y 2024. Se excluyen como etiquetas elegibles 2009 y 2012 porque
no tienen un antecedente comparable dentro de esta fuente. Sus observaciones sí se utilizan
como información histórica para elecciones posteriores. No se inventan filas para años intermedios.

Los ejemplos son estados que reaparecen en procesos posteriores. Esto evalúa la anticipación
temporal de las mismas entidades; no mide generalización a territorios nunca observados.

## Variables: 25 entradas

Se construyen desde `app/ml/features.py`, sin leer los indicadores de fase 3 que incluyen el año objetivo.
Todas las entradas históricas satisfacen `source_year < target_year`.

| Grupo | Variables y referencia temporal |
| --- | --- |
| Abstención comparable | Última tasa del mismo tipo y media de todas las tasas comparables anteriores |
| Tendencia histórica | Pendiente de abstención de las elecciones comparables previas, en pp/año, disponible desde dos antecedentes |
| Variabilidad | Desviación estándar muestral de tasas comparables previas, en pp |
| Cambio previo | Cambio de participación entre los dos últimos antecedentes comparables, en pp |
| Suficiencia histórica | Número de antecedentes comparables válidos, número total de elecciones previas y años desde la anterior comparable |
| Contexto reciente | Abstención de la última elección de cualquier tipo, estrictamente anterior |
| Información faltante | `NS/LN` de la última elección comparable y de la última elección de cualquier tipo |
| Tamaño poblacional previo | `log(1+LN)` de la última elección anterior |
| Contexto nacional previo | Brecha de abstención respecto del país en la última elección comparable y fracción de antecedentes comparables por encima de la abstención nacional |
| Composición demográfica previa | Proporción de mujeres en LN y cinco proporciones por bandas de edad, tomadas de la última elección anterior |
| Tipo de sección previo | Proporciones de LN urbana, mixta y rural de la última elección anterior |
| Categorías conocidas | Clave estable de entidad y tipo de elección objetivo, conocido antes de la jornada |

Ejemplo: para predecir 2024 se usa 2018 como última elección comparable y 2021 para composición
demográfica reciente. No se usan votantes, no votantes, LN, NS, márgenes demográficos ni agregados
nacionales de 2024 como entradas. El año del objetivo solo selecciona el corte, no se introduce
como una variable numérica adicional. Los conteos objetivo se emplean exclusivamente para la
etiqueta y las métricas de evaluación.

Cada ejemplo conserva `feature_source_years`, `feature_source_ids`, año del antecedente comparable
y año demográfico. No se calcula la tendencia con el resultado que se pretende anticipar.
Las pendientes usadas como variables desde dos antecedentes son resúmenes deterministas del pasado,
no pruebas de significancia; difieren del mínimo de tres puntos para publicar tendencias en fase 3.

Los márgenes se validan contra la LN de su propia elección histórica antes de obtener proporciones.
Una categoría ausente se interpreta como cero solo dentro de un margen completo y conocido.
No se imputa categoría no binaria a años anteriores ni se incorpora una variable de escolaridad inexistente.

## Cortes temporales y ausencia de fuga computacional

| Ajuste: años de etiquetas | Prueba | Entrenamiento | Prueba |
| --- | --- | ---: | ---: |
| 2015 | 2018 | 32 | 32 |
| 2015 y 2018 | 2021 | 64 | 32 |
| 2015, 2018 y 2021 | 2024 | 96 | 32 |

Cada corte reserva la elección completa. No se hace una división aleatoria de estados ni se
usa `TimeSeriesSplit` sobre filas individuales, que podría separar estados del mismo proceso.
Los años anteriores a 2015 son fuentes de variables; no se confunden con años de etiquetas ajustadas.

Los cortes 2018 y 2021 constituyen desarrollo. Se selecciona el menor MAE estatal conjunto de esos
64 casos; los empates siguen el orden declarado de modelos. La selección se guarda físicamente en
`frozen_development_selection.json` antes de puntuar 2024. El corte 2024 permanece como prueba final.
Las métricas que agrupan los tres cortes y los desgloses por tipo electoral son descriptivas y no
intervienen en esa selección. No se cambia el ganador usando 2024.

Los parámetros se fijan antes del experimento. No se ejecutan Optuna, búsqueda en rejilla ni ajuste
manual después de ver resultados. Los pocos bloques temporales no permiten una búsqueda interna
amplia defendible. En el primer corte el único año supervisado es 2015, de tipo intermedio: 2018
es un tipo no observado durante ese ajuste. La limitación queda registrada en el reporte.

### Disponibilidad histórica de las fuentes

La validación garantiza que el contenido de las entradas procede de años electorales anteriores
al objetivo y que no se ajusta el procesamiento sobre la prueba. Sin embargo, los ZIP actuales
son publicaciones retrospectivas; los de 2009–2021 se descargan de rutas de publicación de 2022.
No se han acreditado versiones y fechas efectivas de publicación equivalentes para cada corte.

Por ello `publication_vintage_verified=false`. **Este experimento no certifica una recreación ex ante
con los archivos exactos disponibles en cada fecha histórica**. Es una validación retrospectiva por
año electoral. No usa los distritos homologados con cartografía posterior, pero diferencias de
versión o cobertura de los datos históricos siguen siendo una limitación. Acreditar esos archivos
y sus fechas es necesario antes de sostener una evaluación histórica operativa estricta.

## Procesamiento y modelos

Todo el procesamiento aprendido está dentro de un Pipeline de scikit-learn, ajustado únicamente
con el bloque de entrenamiento de cada corte:

- Imputación numérica por mediana de entrenamiento, con indicadores de ausencia.
- Una columna totalmente ausente durante entrenamiento se conserva con cero e indicador de ausencia;
  nunca se consulta la prueba para completarla.
- Estandarización numérica para Ridge; los árboles usan las variables imputadas sin estandarizar.
- Codificación one-hot aprendida en entrenamiento; categorías futuras desconocidas se ignoran.
- Semilla 42, modelos en CPU y un hilo por estimador; el comando limita también los hilos numéricos.

| Modelo | Parámetros principales fijados |
| --- | --- |
| `baseline_last` | Abstención de la última elección anterior del mismo tipo |
| `baseline_mean` | Media de todas las elecciones anteriores del mismo tipo |
| `ridge` | Alpha 10; solver SVD; escalado numérico dentro del Pipeline |
| `random_forest` | 300 árboles, profundidad máxima 4, mínimo 5 muestras por hoja, max_features 0.8 |
| `xgboost` | 150 árboles, profundidad 2, learning_rate 0.05, min_child_weight 5, lambda 10 |
| `lightgbm` | 150 árboles, profundidad 3, 7 hojas, mínimo 10 muestras, learning_rate 0.05, lambda 10 |

Los baselines no estiman parámetros a partir de las etiquetas de entrenamiento; son referencias
deterministas calculadas con el pasado de cada estado. También se serializan para reproducibilidad.

Como política previa común, se recortan las salidas de todos los modelos al intervalo físico [0,1].
Se conservan predicciones crudas y número de recortes. En el experimento registrado, Ridge produjo
siete predicciones fuera de rango en 2018; las métricas publicadas incluyen ese recorte predefinido.
No se cambian hiperparámetros para corregir su desempeño después de ver la prueba.

## Métricas

La métrica principal es MAE en puntos porcentuales, con igual peso para cada entidad. Se calculan
también RMSE, R², sesgo medio, error absoluto máximo y MAE ponderado por participación conocida.
La ponderación objetivo `SV+NV` es un diagnóstico de evaluación, no una entrada ni un peso de ajuste.

R² puede ser negativo: eso se informa tal cual. Si el objetivo es constante se devuelve nulo en vez
de presentar una capacidad explicativa ficticia. No se equipara el R² de una prueba con una precisión
garantizada para futuras elecciones.

Los 32 estados de una elección comparten contexto y no representan 32 elecciones independientes.
Solo hay dos bloques de desarrollo y una elección de confirmación, con un único corte intermedio
fuera de muestra. No se atribuye significancia a diferencias pequeñas ni se estima un intervalo
predictivo usando supuestos de independencia no justificados. La cobertura y NS afectan la etiqueta.

## Versiones, pesos y registro

El identificador del experimento deriva de la instantánea de datos, huella del código ML, parámetros,
protocolo y versiones de paquetes. Las bibliotecas quedan bloqueadas en `uv.lock`.
`artifacts/models/<run_id>/` conserva:

- Instantánea de los agregados y fuentes con SHA-256 de los ZIP originales.
- Los 128 ejemplos con variables y linaje, y los 64 casos excluidos con su motivo.
- Protocolo, parámetros y selección congelada de desarrollo.
- Dieciocho modelos de los cortes temporales y seis modelos finales.
- Predicciones fuera de tiempo y reporte completo.
- Manifiesto SHA-256 de todos los archivos del experimento.

Los seis modelos finales se reajustan con los 128 ejemplos después de cerrar la evaluación.
**No son los modelos usados para obtener el error de 2024**: estos últimos solo ajustan etiquetas
de 2015, 2018 y 2021 y permanecen en archivos separados. No se genera una predicción futura en esta fase.

Las versiones se registran transaccionalmente en `ine.model_versions`. La tabla tiene RLS, permite
solo lectura a `ine_api` y usa el propietario para registro. Guardar metadatos no sube los pesos
a Supabase Storage; los archivos siguen siendo artefactos locales excluidos de Git.

Repetir el comando con los mismos datos y código verifica los checksums, reutiliza el experimento
cerrado y registra sin duplicar versiones. Un archivo modificado no se carga de forma silenciosa.
Los archivos Joblib solo se deben abrir desde un experimento propio verificado: contienen objetos
Python serializados, no un formato público seguro para archivos arbitrarios.

## Ejecución

```powershell
uv sync --group ml
uv run --group ml alembic upgrade head
uv run --group ml python scripts/train_models.py --register
```

`--register` escribe únicamente los metadatos en Supabase. Sin esa opción, el entrenamiento y la
publicación de informes se conservan localmente. Para reproducir desde la instantánea congelada:

```powershell
uv run --group ml python scripts/train_models.py --snapshot artifacts/models/<run_id>/source_snapshot.json
```

Los artefactos pertenecen a la versión bloqueada de bibliotecas. La reproducibilidad numérica entre
entornos distintos debe comprobarse con sus versiones, no asumirse como igualdad binaria universal.
El API no necesita el grupo ML para consultar métricas; lee solo metadatos de PostgreSQL.

## API y verificación

```text
GET /api/v1/models/metrics
GET /api/v1/models/metrics?run_id=<20 caracteres hexadecimales>
```

La respuesta contiene los seis modelos del último experimento o del solicitado, selección de
desarrollo, fuentes, huellas, parámetros y métricas por corte. Un registro vacío devuelve 404.
No expone un endpoint de entrenamiento ni deserializa pesos durante las consultas.

```powershell
uv run --group ml ruff check .
uv run --group ml ruff format --check .
uv run --group ml pytest tests/ml -q
$env:RUN_INTEGRATION = '1'
$env:RUN_ML_INTEGRATION = '1'
uv run --group ml pytest -q
Remove-Item Env:RUN_INTEGRATION
Remove-Item Env:RUN_ML_INTEGRATION
```

Las pruebas comprueban que alterar etiquetas o demografía futuras no cambia entradas históricas,
que imputadores y categorías no aprenden de la prueba, que todas las filas de la elección objetivo
quedan fuera de ajuste y que 2024 no puede cambiar la selección de desarrollo. También verifican
los seis candidatos, fórmulas de error, integridad de artefactos y reproducción del modelo congelado
frente a las predicciones y métricas realmente registradas.

Referencias técnicas primarias:

- [scikit-learn: prácticas y prevención de fuga de información](https://scikit-learn.org/stable/common_pitfalls.html).
- [XGBoost: parámetros](https://xgboost.readthedocs.io/en/stable/parameter.html).
- [LightGBM: parámetros](https://lightgbm.readthedocs.io/en/stable/Parameters.html).
