# Auditoría de la app publicada · 26 de octubre de 2026

## Alcance y entorno

URL revisada: https://pulso-electoral-demo.vercel.app, producción del commit `5be0ab3`
(merge del PR #16). Se recorrieron las ocho vistas mediante el navegador, con usuario QA confirmado
contra Supabase real. Se consultó Groq real desde Análisis. La demo sirve la instantánea del
repositorio (`PULSO_PREVIEW=1`); no hay backend FastAPI desplegado ni persistencia de escenarios.

Las correcciones descritas abajo están en el código local y requieren commit, revisión y despliegue.
No se presentan como ya publicadas. Las pruebas automatizadas locales usan la fixture Auth y
el backend Docker, distintos del recorrido real en Vercel.

## Recorrido observado en producción

| Área | Evidencia | Resultado |
| --- | --- | --- |
| Login | Primera cuenta QA confirmada accedió al dashboard. | Aprobado con Auth real. |
| Mapa | Selección desde ranking de Baja California; riesgo alto y 62.4% de abstención estimada. Pestañas Histórico, Factores y Recomendaciones accesibles. | Datos del detalle correctos. Tarjetas superiores aún contenían cifras ficticias del diseño. |
| Tendencias | Desde «Comparar históricos»: intermedias 2009/2015/2021; al elegir Presidencial, 2012/2018/2024. Baja California conservada. | Aprobado para el cambio de tipo y territorio. |
| Análisis | Buscar Acapulco dejó una fila (58.6% participación ilustrativa); diálogo de IA consultó Guerrero y respondió 43.7% de abstención 2027, banda 29.3%–58.0%. | Búsqueda e IA real aprobadas; las tarjetas municipales son demostración. |
| Laboratorio | Seis modelos y sus errores. XGBoost para Baja California: 53.6%; +3 pp de participación produjo 50.6%, banda 37.9%–63.2%. | Cálculo local aprobado, sin guardado ni reentrenamiento. |
| Predicciones | Baja California: 62.4%, banda 48.0%–76.8%, 5 estados en riesgo alto. Prueba anterior del asistente en Morelos identificó `IA · qwen/qwen3.8-27b`. | Indicadores y asistente disponibles; no se confunden métricas de diferentes experimentos. |
| Escenarios | Baja California −3 pp de participación produjo 65.4% de abstención y 34.6% de participación; ID `preview-no-guardado-02--3`. Cambiar el supuesto a +4 quitó el resultado anterior. | Aprobado; etiqueta explícita de cálculo local sin persistencia. |
| Reportes | Nacional cambió el título a México, pero conservó 62.4% y los hallazgos de Baja California. Página siguiente cambió 1/5 a 2/5 sin cambiar contenido. | Errores reproducidos y corregidos localmente. |
| Datos | Buscar «baja» devolvió dos entidades. CSV descargado como `pulso-datos-estatal-2024.csv`. Muestra municipal mostró cinco municipios con aviso ilustrativo. | Búsqueda, descarga y cambio de nivel aprobados. No se afirma haber verificado todas las exportaciones posibles en producción. |
| Metodología | Diálogo con tasas SV/NV, NS, incertidumbre, escenarios, cartografía y seis fuentes electorales. | Contenido accesible. |
| Consola | Consulta de errores/advertencias en el recorrido, antes de descargar CSV: lista vacía. | Sin errores registrados en esa observación; no es monitoreo continuo. |

El logout y la protección de rutas se habían comprobado en el despliegue inicial y tras el merge del
PR #16: `/login` 200, `/` 307 a login y las dos APIs privadas 401 sin sesión.
La revisión no realizó nuevos registros públicos ni cambios de contraseña: hacen falta buzones reales.

## Correcciones realizadas

| Severidad | Ubicación | Antes | Después | Motivo |
| --- | --- | --- | --- | --- |
| Alta | `frontend/src/components/electoral-kpis.tsx` | Participación, municipios y población ficticios en las tarjetas principales; aviso alejado en el pie. | Participación, abstención, banda y número de estados de riesgo alto derivados de los pronósticos; siguen el estado elegido y muestran — sin datos. | Evitar presentar cifras inventadas como indicadores operativos. |
| Alta | `frontend/src/components/reports.tsx` | Alcance nacional con cifras de un solo estado. | Nacional, municipal y plantillas todavía no implementadas quedan deshabilitados; se identifica el alcance estatal. | Evitar interpretar una tasa estatal como nacional. |
| Media | `frontend/src/components/reports.tsx` | Paginador que cambiaba el número, sin cambiar el contenido. | Vista continua, sin paginación ficticia. | Eliminar una interacción que no cumple su función. |
| Media | `frontend/src/components/reports.tsx` y `dashboard.tsx` | «Generar reporte», formatos y switches sugerían archivos y envíos operativos. | «Guardar vista previa», historial de configuraciones de sesión, formatos y programación deshabilitados, texto de pendientes visible. | No afirmar funciones que aún no existen. |
| Media | `frontend/src/components/analysis-view.tsx` | Respuesta de IA conservada al cambiar estado o periodo. | Respuesta asociada al contexto consultado; no se muestra para otro contexto. Incluye etiqueta del modelo. | Evitar atribuir respuestas a otra entidad o periodo. |
| Alta | `frontend/src/components/design-top.tsx` y `design-top.css` | La barra de secciones se ocultaba en pantallas de hasta 1180 px sin alternativa. | Selector móvil accesible con las ocho secciones. | Permitir navegar por toda la aplicación desde teléfono o tablet. |
| Media | `README.md` | «Solo localhost», Auth pendiente antes de desplegar, modos y entregas históricas mezclados. | Describe Vercel, Auth/Groq reales, instantánea, ocho vistas, pruebas, ejecución y prioridades actuales. | Documentación coherente con el producto actual. |

Se conservaron los componentes, tokens y lenguaje visual del proyecto. La revisión se centró en
interacciones y significado de los datos; no constituye auditoría completa WCAG ni rediseño.

## Validación de las correcciones

- Pruebas unitarias frontend: 9 aprobadas.
- Compilación de producción: aprobada; TypeScript sin errores.
- Regresiones añadidas: tarjetas ligadas al pronóstico y cambio territorial; respuesta de IA no reutilizada
  al cambiar periodo; controles pendientes y ausencia de paginación ficticia en Reportes.
- Suite final de navegador: **25 aprobadas**, incluidas autenticación, API, mapa, histórico,
  selección, escenarios con persistencia local, exportación, estados de error y las nuevas regresiones.
- Nueva prueba de navegación móvil: abre las ocho secciones a 390 px, sin desbordamiento horizontal.
- Revisión visual: tarjetas, mapa y selector móvil comprobados. Capturas de la versión local:
  [escritorio](screenshots/audit-dashboard-20261026.png) y [móvil](screenshots/audit-mobile-20261026.png).
- Un primer intento de navegador sufrió 503 porque Docker dejó de estar activo. Se identificó
  conexión rechazada a `127.0.0.1:8001`; no se contabiliza ese intento como validación aprobada.

## Qué falta para completar la aplicación

1. SMTP y pruebas reales de registro, confirmación y recuperación; revisar privacidad, términos y ayuda.
2. Backend con persistencia en producción, protección propia de FastAPI, historial y propiedad de escenarios por usuario.
3. Sustituir Análisis ilustrativo por consultas oficiales y homologar datos municipales antes de utilizarlos como evidencia.
4. Generación de PDF/PPTX/XLSX, reportes nacionales/municipales, notas/factores, historial persistente y envíos programados.
5. Cuotas y límites de IA por usuario, monitoreo, alertas, copias/restauración y carga.
6. WCAG con tecnologías de asistencia, usabilidad con usuarios y navegación de escritorio más directa a Tendencias/Laboratorio.
7. Validación externa de modelos, más bloques temporales y revisión de sesgo por NS/fechas de publicación.
8. Actualización verificable de fuentes, optimización de cartografía y licencia del código.

Approve — correcciones locales en las interacciones inspeccionadas, con los límites del prototipo
indicados arriba. No implica aprobación para uso operativo ni confirma publicación de estos cambios.
