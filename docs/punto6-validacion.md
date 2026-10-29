# Punto 6 · Validación temporal, NS e incertidumbre

**Estado:** auditoría retrospectiva implementada. **Validación externa independiente
y prospectiva aún no acreditadas.** Base: instantáneas congeladas del experimento
`daf97a195864693a644e` y pronóstico `e63b667cf09b747f7de8`.

## Metodología verificable
Se auditan **576 predicciones fuera de tiempo** (6 modelos × 3 elecciones ×
32 entidades) en `data/samples/ccpc_backtest_errors.csv`. Los años de desarrollo
2018 y 2021 seleccionaron `baseline_last`; la presidencial 2024 quedó reservada
como prueba final. Se conservan modelos, parámetros y pesos ya publicados; **no
se reentrena ni se elige otro modelo basándose en 2024**.

| Bloque | Tipo | MAE (pp) | RMSE (pp) | Sesgo (pp) |
|---|---|---:|---:|---:|
| 2018 | Presidencial | 2.789 | 3.430 | +0.092 |
| 2021 | Intermedia | 7.981 | 9.857 | +4.311 |
| 2024 | Presidencial | 3.492 | 4.134 | −2.719 |

2024 **no predice** el error de 2027 (intermedia). Los 32 estados no equivalen
a 32 elecciones independientes y las series comparten perturbaciones comunes.
El ranking descriptivo de modelos en 2024 no debe cambiar al seleccionado.

## Banda de referencia y cobertura
La predicción 2027 utiliza el error de una única elección intermedia anterior,
2021: **radio 14.368856 pp** con 32 entidades correlacionadas.
`coverage_guaranteed=false`; no es un intervalo de confianza de 90%.
La comprobación cronológica usa solamente errores anteriores del mismo tipo:
2018 y 2021 no tienen bloques previos comparables; 2024 usa solo 2018,
radio 5.622313 pp y cobertura retrospectiva 81.25% (26/32).
**No respalda cobertura futura de la intermedia 2027.**

## Sensibilidad NS
El objetivo `NV/(SV+NV)` excluye registros NS. El diagnóstico presenta su
proporción y, para 2024 en cada estado, límites ilustrativos si todos los NS
se asignaran hipotéticamente a SV o NV, suponiendo que SV+NV+NS cubre la
lista nominal. Límites: `tasa_conocida × (1 − NS/nominal)` y ese
resultado `+ NS/nominal`. La media de NS/nominal en 2024 fue 6.829%.
Es **sensibilidad del dato histórico**, no una corrección oficial ni
un intervalo predictivo. La auditoría rechaza tasas fuera de [0,1].

## Validación externa
No se han verificado versiones históricas de publicación de las fuentes
(*vintages*) en cada fecha objetivo. Tampoco existe una evaluación
verdaderamente independiente con un resultado posterior a 2024 previamente
desconocido. Por tanto: `publication_vintage_verified=false`,
`independent_external_dataset_verified=false`, `production_ready=false`.

Para promover el modelo se necesitan fuentes fechadas acreditadas, un objetivo
posterior no usado para entrenamiento/selección/calibración, predicciones
congeladas antes de observarlo, cobertura por tipo electoral, comparaciones
predefinidas con baselines y aprobación documentada del equipo.
Los municipios siguen excluidos hasta su homologación temporal.

## Reproducir
`python -m scripts.validate_forecasts --check` comprueba que
`docs/punto6_validacion.json` y
`frontend/src/lib/forecast-validation.json` correspondan a los
registros, modelo y pronóstico congelados. Sin `--check` reconstruye ambos.
CI ejecuta este control y las pruebas de rechazo de bloques duplicados,
incompletos, fugas temporales y selección retrospectiva.

La interfaz incluye una tarjeta moderna y accesible, con errores
históricos por entidad, ejemplo de NS y aviso de validación externa pendiente;
nunca atribuye resultados de una corrida a un modelo distinto.
