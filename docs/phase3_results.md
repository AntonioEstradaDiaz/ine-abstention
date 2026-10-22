# Resultados descriptivos de participación y abstención

Datos observados CCPC 2009–2024. No son predicciones ni estimaciones causales.
Los porcentajes usan SV + NV. NS se presenta aparte. Los cambios comparan el mismo tipo de elección.

## Resumen nacional

| Año | Tipo | Participación | Abstención | NS / LN | Cambio de participación (pp) | Comparación |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| 2009 | Intermedias | 44.06% | 55.94% | 2.41% | Sin comparación | Sin anterior |
| 2012 | Presidenciales | 62.08% | 37.92% | 0.22% | Sin comparación | Sin anterior |
| 2015 | Intermedias | 47.07% | 52.93% | 6.13% | +3.01 | 2009 |
| 2018 | Presidenciales | 62.37% | 37.63% | 6.83% | +0.28 | 2012 |
| 2021 | Intermedias | 51.84% | 48.16% | 4.32% | +4.76 | 2015 |
| 2024 | Presidenciales | 59.67% | 40.33% | 6.43% | -2.70 | 2018 |

## Tendencias nacionales por tipo de elección

### Intermedias

Años: 2009, 2015, 2021. Media de abstención por elección: 52.34%.
Pendiente de participación: +0.65 pp por año.
Desviación estándar muestral de abstención: 3.92 pp.
Solo tres elecciones: la recta describe la serie; no establece significancia ni predice una elección futura.

Estados con mayor abstención observada en 2021:

| Estado | Abstención | Brecha frente al agregado nacional (pp) | NS / LN |
| --- | ---: | ---: | ---: |
| BAJA CALIFORNIA | 62.40% | +14.24 | 6.59% |
| DURANGO | 57.93% | +9.76 | 2.66% |
| SONORA | 57.47% | +9.30 | 7.29% |
| QUINTANA ROO | 56.68% | +8.51 | 4.63% |
| GUANAJUATO | 56.44% | +8.28 | 2.40% |

Estados con participación por debajo del agregado nacional en las tres elecciones comparables: AGUASCALIENTES, BAJA CALIFORNIA, CHIHUAHUA, CIUDAD DE MEXICO, DURANGO, HIDALGO, QUINTANA ROO, SINALOA, TAMAULIPAS.

### Presidenciales

Años: 2012, 2018, 2024. Media de abstención por elección: 38.63%.
Pendiente de participación: -0.20 pp por año.
Desviación estándar muestral de abstención: 1.48 pp.
Solo tres elecciones: la recta describe la serie; no establece significancia ni predice una elección futura.

Estados con mayor abstención observada en 2024:

| Estado | Abstención | Brecha frente al agregado nacional (pp) | NS / LN |
| --- | ---: | ---: | ---: |
| BAJA CALIFORNIA | 52.95% | +12.62 | 7.19% |
| SONORA | 50.42% | +10.09 | 10.37% |
| CHIHUAHUA | 48.14% | +7.81 | 14.92% |
| BAJA CALIFORNIA SUR | 46.94% | +6.61 | 4.56% |
| DURANGO | 46.26% | +5.93 | 2.00% |

Estados con participación por debajo del agregado nacional en las tres elecciones comparables: AGUASCALIENTES, BAJA CALIFORNIA, BAJA CALIFORNIA SUR, COLIMA, CHIHUAHUA, DURANGO, GUANAJUATO, MICHOACAN, NAYARIT, NUEVO LEON, QUINTANA ROO, SINALOA, SONORA, TAMAULIPAS.

## Cobertura y límites

En 2024, NS representa 6.43% de la lista nominal.
Si todos los registros NS hubieran votado o se hubieran abstenido, el rango aritmético de abstención sobre LN sería 37.74%–44.17%.
Ese rango solo describe información faltante; no es un intervalo de predicción ni de confianza.
Los municipios tienen estadísticas de cada año y brechas frente a su estado y al país. No se han unido como una serie histórica homologada.
Las diferencias de cobertura y los cambios de NS pueden afectar la comparación entre elecciones.

## Reproducibilidad

Generar con `uv run python scripts/report_statistics.py`. Fórmulas y contratos en `docs/phase3.md`.
El JSON conserva todos los indicadores estatales por año y los identificadores de fuente; el CSV incluye 192 observaciones estatales.
