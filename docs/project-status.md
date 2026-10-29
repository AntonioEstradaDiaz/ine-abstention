# Estado del proyecto y plan de mejora

Estado revisado: 28 de octubre de 2026 (America/Mexico_City). Nombre de producto: **Pulso electoral**.
Repositorio: `AntonioEstradaDiaz/ine-abstention`, público a la fecha de revisión. Estado: demo funcional, con pendientes de producción.

## Qué problema resuelve

Permite explorar dónde y cómo cambia la participación electoral, comparar elecciones del mismo tipo,
consultar una referencia predictiva estatal e investigar escenarios hipotéticos. Reúne datos y procedencia,
API, evaluación temporal, cartografía contextual y una interfaz que muestra las limitaciones estadísticas.

No identifica personas, no estima preferencias partidistas y no demuestra qué intervención aumentaría la participación.
Los CCPC son agregados de cuadernillos y tienen cobertura y registros NS que requieren interpretación cuidadosa.

## Entregado

| Componente | Estado y evidencia |
| --- | --- |
| Infraestructura | FastAPI + PostgreSQL/PostGIS; alternativa Supabase Free; migraciones y roles. |
| Ingesta | Seis elecciones 2009–2024, catálogo oficial, descarga con SHA-256, calidad e idempotencia. |
| Datos preparados | 14,971 instantáneas territoriales, 139,653 desgloses demográficos; conteos en informes de fase 2. |
| Estadísticas | Tasas, cambios comparables, tendencias y distribuciones expuestas mediante API. |
| Evaluación ML | Dos baselines y cuatro candidatos; validación por elección; selección solo con desarrollo 2018/2021. |
| Predicción | 32 estados, 2027 intermedia; baseline_last, semáforo de tres niveles, bandas y explicación. |
| Simulación | POST con supuestos, resultados persistidos y recuperación por identificador; límites 0–100%. |
| Demostración backend | Docker local, restauración idempotente y recorrido HTTP documentado en fase 7. |
| Frontend | Ocho secciones: Laboratorio de modelos, Análisis IA, Mapa, Tendencias, Predicciones, Escenarios, Reportes y Datos; cartografía INEGI, cliente tipado, proxy y exportaciones CSV/JSON. |
| Asistente | Groq, Gemini u Ollama, contexto estatal consultado en servidor y lectura automática cuando el proveedor no responde. |
| Datos y Reportes | Datos descarga CSV/JSON de conteos nacionales y estatales; la muestra municipal es ilustrativa. Reportes permite descarga PDF/Excel estatal; reportes nacionales y municipales y envíos programados siguen pendientes. |
| CI | GitHub Actions con pruebas unitarias, ML, integración, TypeScript, build y Playwright; ver ci.md. |
| Validación frontend | TypeScript, compilación y recorrido de navegador de escritorio/móvil; evidencia en frontend-validation.md. |

## Qué no está terminado

- Publicación en un entorno remoto, dominio y operación continua.
- Identidad de usuarios, permisos de lectura/escritura, límites por usuario y auditoría de uso.
- Homologación municipal/distrital/seccional y cartografía electoral comparable entre años.
- Evidencia predictiva suficiente para considerar el modelo listo para producción.
- Verificación histórica de fechas de publicación de todas las variables y revisiones de las fuentes.
- Calibración con más elecciones independientes y estudio explícito del sesgo por NS.
- Comparación simultánea de escenarios entre varios estados. El historial privado de escenarios ya está implementado.
- Simulaciones simultáneas entre varios estados, análisis demográfico y reportes nacionales/municipales; PDF/XLSX estatales ya implementados.
- Pruebas de carga/concurrencia, recuperación ante desastres y auditoría completa WCAG (ver `punto9-accesibilidad.md`).
- Licencia de distribución del código acordada por su titular; conservar atribuciones de fuentes y dependencias.

## Mejoras priorizadas y criterios de aceptación

| Prioridad | Mejora | Para considerarla terminada |
| --- | --- | --- |
| P0 antes de abrir a Internet | Autenticación, autorización y límites | Escrituras autenticadas, separación de roles, rechazo de abuso y pruebas de permisos. |
| P0 antes de operar | Secretos, HTTPS, respaldo y observabilidad | Secretos fuera del repositorio, restauración ensayada, alertas y trazabilidad de errores. |
| P1 estadística | Más evidencia temporal | Cortes por elección, versiones de publicación verificadas y evaluación externa predefinida. |
| P1 incertidumbre | NS y calibración | Análisis de sensibilidad, más bloques electorales y resultados de cobertura reportados sin promesas infundadas. |
| P1 geografía | Correspondencias verificadas | Crosswalk documentado y pruebas de conservación de conteos antes de habilitar nuevos niveles. |
| P1 experiencia | Auditoría de accesibilidad | WCAG contrastado, lector de pantalla, teclado, zoom y prueba con usuarios; corregir hallazgos. |
| P2 rendimiento | Cartografía más ligera | Derivado simplificado o teselas con procedencia, topología validada y comparación visual con el original de 28.8 MB. |
| P2 producto | Guardados y escenarios múltiples | Recuperar por URL/ID, comparar estados y exportar supuestos, linaje y resultados juntos. |
| P2 mantenimiento | Mantener CI y dependencias | Conservar los checks existentes, revisar vulnerabilidades y actualizar los locks de forma controlada. |

No se necesita un modelo más complejo para que el dashboard funcione. Para mejorar pronósticos se necesita
primero evidencia temporal y calidad de variables; el baseline sigue siendo una referencia transparente.

## Decisiones preservadas

1. Abstención = NV/(SV+NV), no 1−SV/LN. NS permanece separado.
2. Comparaciones entre elecciones del mismo tipo.
3. El MAE final 2024 no se usa para volver a seleccionar el modelo.
4. Tres niveles relativos de riesgo, sin crear una cuarta categoría artificial.
5. Banda empírica de soporte limitado, sin garantía de cobertura futura.
6. Simulación aritmética no causal; no estima efectos de campañas o políticas.
7. Geografía contextual INEGI separada de la comparabilidad electoral.
8. Secretos y base de datos fuera de Git; el navegador no tiene acceso administrativo a Supabase.
