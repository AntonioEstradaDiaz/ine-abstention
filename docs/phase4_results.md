# Comparación temporal de modelos de abstención

Experimento: `daf97a195864693a644e`. Unidad territorial: entidad federativa.
Ejemplos supervisados: 128; excluidos: 64.
Los primeros procesos de cada tipo carecen de un antecedente comparable y no se inventan variables.

## Cortes de validación

| Entrenamiento: años objetivo | Prueba | Filas de entrenamiento | Filas de prueba |
| --- | --- | ---: | ---: |
| 2015 | 2018 | 32 | 32 |
| 2015, 2018 | 2021 | 64 | 32 |
| 2015, 2018, 2021 | 2024 | 96 | 32 |

## Comparación

MAE y RMSE en puntos porcentuales. Cada estado tiene el mismo peso en la métrica principal.

| Modelo | MAE desarrollo | MAE 2024 | RMSE 2024 | R² 2024 |
| --- | ---: | ---: | ---: | ---: |
| baseline_last | 5.385 | 3.492 | 4.134 | 0.451 |
| baseline_mean | 5.504 | 3.325 | 3.940 | 0.501 |
| ridge | 12.152 | 4.681 | 5.396 | 0.064 |
| random_forest | 7.889 | 3.014 | 3.467 | 0.614 |
| xgboost | 6.455 | 2.947 | 3.817 | 0.532 |
| lightgbm | 8.121 | 2.881 | 3.880 | 0.516 |

Selección congelada usando solo 2018 y 2021: **baseline_last**.
Diferencia de MAE en 2024 frente a baseline_last: +0.000 pp.
Una diferencia negativa favorece al seleccionado; una positiva favorece al baseline.
2024 se usa para evaluación final; no se cambia el ganador después de ver ese resultado.

## Métricas por elección

| Año de prueba | Modelo | MAE (pp) | RMSE (pp) |
| --- | --- | ---: | ---: |
| 2018 | baseline_last | 2.789 | 3.430 |
| 2018 | baseline_mean | 2.789 | 3.430 |
| 2018 | ridge | 17.473 | 21.908 |
| 2018 | random_forest | 9.386 | 10.532 |
| 2018 | xgboost | 5.898 | 7.179 |
| 2018 | lightgbm | 8.594 | 10.245 |
| 2021 | baseline_last | 7.981 | 9.857 |
| 2021 | baseline_mean | 8.219 | 10.249 |
| 2021 | ridge | 6.831 | 8.364 |
| 2021 | random_forest | 6.391 | 7.941 |
| 2021 | xgboost | 7.013 | 8.258 |
| 2021 | lightgbm | 7.649 | 9.024 |
| 2024 | baseline_last | 3.492 | 4.134 |
| 2024 | baseline_mean | 3.325 | 3.940 |
| 2024 | ridge | 4.681 | 5.396 |
| 2024 | random_forest | 3.014 | 3.467 |
| 2024 | xgboost | 2.947 | 3.817 |
| 2024 | lightgbm | 2.881 | 3.880 |

## Interpretación y límites

Los estados de una misma elección no son 32 réplicas temporales independientes.
Solo hay dos bloques de desarrollo y un bloque final. La comparación es exploratoria.
En el primer corte, el entrenamiento supervisado solo contiene elecciones intermedias; 2018 es un tipo no observado durante ese ajuste.
Se fijaron parámetros, semillas y procesamiento antes de calcular las métricas. No se usaron búsquedas sobre 2024 ni particiones aleatorias entre estados de una elección.
El linaje de variables respeta años anteriores al objetivo. Sin embargo, las versiones históricas de publicación no están acreditadas. Es una validación retrospectiva por fecha electoral, no una recreación ex ante verificada.
Los municipios están excluidos hasta homologarlos. NS y la cobertura de cuadernillos pueden sesgar la abstención observada.
Los pesos finales se reajustaron con todos los ejemplos disponibles después de evaluar. Esos pesos no son los usados para producir el error de 2024; ambos se conservan separados.
No se producen aún intervalos, efectos causales, predicciones de elecciones futuras ni una promoción automática a producción.

## Reproducibilidad

El JSON conserva parámetros, métricas, versiones, huellas de datos y código, fuentes oficiales y selección congelada. Los artefactos incluyen la instantánea, variables con linaje, modelos de cada corte, pesos finales y manifiesto SHA-256.
El CSV `data/samples/ccpc_backtest_errors.csv` conserva cada error por entidad, año y modelo.
Metodología y ejecución: `docs/phase4.md`.
