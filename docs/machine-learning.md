# Machine learning en Atlas De La Participación

## Datos y objetivo

El sistema estima abstención estatal a partir de conteos INE CCPC. El histórico
versionado comprende intermedias 2009, 2015 y 2021 y presidenciales 2012, 2018 y 2024.
Participación = SV / (SV + NV); abstención = NV / (SV + NV). NS se informa aparte.
No se mezcla una elección presidencial con una intermedia como si fueran observaciones anuales equivalentes.

## Entrenamiento y evaluación

El laboratorio compara baseline_last, baseline_mean, Ridge, Random Forest, XGBoost
y LightGBM. La preparación excluye ejemplos sin antecedente comparable y la evaluación
respeta el orden temporal: se aprende del pasado y se prueba en una elección posterior.
No se entrena con el resultado que se intenta predecir.

El experimento documentado eligió baseline_last usando 2018 y 2021. Su MAE de prueba
2024 fue **3.492 puntos porcentuales**, con 32 estados. Ese error es histórico: no es
una garantía para 2025–2028 ni una probabilidad de acierto. Aunque otros modelos tienen
menor error en 2024, no se cambia retrospectivamente el ganador usando la prueba final.
Consulte [resultados y cortes exactos](phase4_results.md) y [auditoría temporal](punto6-validacion.md).

## Qué devuelve actualmente el asistente

La rama principal consultada el 29 de octubre conserva el pronóstico registrado para
2027 cuando coincide el contexto. Para otros años, utiliza la última tasa observada
comparable como referencia constante. Por ello 2025, 2026 y 2028 pueden mostrar el mismo
valor: no equivale a haber entrenado un modelo anual para cada horizonte.

La rama `feature/validated-trend-projection` contiene trabajo experimental para comparar
una regresión temporal con esa referencia. Su publicación no debe darse por integrada:
requiere revisión de coherencia entre horizontes y pruebas del flujo completo. Con solo
tres observaciones por tipo, la comparación dispone de muy pocos cortes y no acredita
precisión futura independiente. No se incorporan predicciones anteriores como si fueran
nuevas observaciones reales.

## Modelo numérico y modelo conversacional

El motor estadístico calcula las cifras. Groq, Gemini u Ollama reciben el contexto para
explicarlo; cambiar de proveedor no reentrena el pronóstico electoral. Un prompt que pide
no inventar datos no constituye una garantía automática de veracidad de todas las respuestas.
Cada afirmación numérica debe cotejarse con su fuente, año, entidad y corrida.

La demo usa una instantánea versionada. Volver a consultar no descarga nuevas elecciones
del INE. Para actualizar el aprendizaje hay que incorporar datos observados validados,
repetir la evaluación temporal y publicar una nueva corrida o instantánea identificable.

## Interpretación responsable

Las proyecciones son experimentales, no observaciones ni resultados oficiales. Elegir
un año no confirma que exista una elección comparable en él. Las bandas empíricas no
garantizan cobertura futura y no deben trasladarse entre modelos u horizontes.
El sistema puede proponer mejoras generales de calidad de datos, evaluación y accesibilidad;
los datos descriptivos no demuestran causas ni efectos de intervenciones sobre los votos.
