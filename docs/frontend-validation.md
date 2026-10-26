# Validación del dashboard conectado

Entrega: 22 de octubre de 2026 (UTC). Entorno Windows, Node.js 24.11.0, Chromium de Playwright,
Next.js 16.4.2 con Webpack y API FastAPI real en Docker local. No se cambiaron modelos, lógica estadística
ni migraciones del backend para construir la interfaz.

Este documento conserva la evidencia histórica de esa entrega, entonces con cuatro secciones.
No describe la cobertura completa actual: hoy hay ocho secciones y asistentes Groq/Gemini/Ollama.
El CI actual también simula respuestas de esos proveedores, además de errores de conexión;
consultar [ci.md](ci.md) y [la guía actual del frontend](../frontend/README.md).

## Comprobaciones

| Comprobación | Resultado |
| --- | --- |
| `npm.cmd run typecheck` | Sin errores, TypeScript estricto y detección de símbolos no usados. |
| `npm.cmd run build` | Compilación de producción correcta; página estática y proxy dinámico. |
| `npm.cmd start` | Versión compilada disponible en http://127.0.0.1:3000. |
| `npm.cmd run test:e2e` | Seis pruebas aprobadas contra backend local real. |
| `scripts/demo_backend.py` | 26 comprobaciones HTTP aprobadas; evidencia en frontend-backend-demo.json. |
| Cartografía | 32 polígonos oficiales, claves 01–32 y SHA-256 en public/geo/provenance.json. |

El recorrido E2E se ejecutó tanto durante el desarrollo como sobre la compilación final servida con `next start`.
No se desactivaron comprobaciones de TypeScript ni se sustituyeron datos reales para superar la integración.
La única respuesta interceptada es el error 503 de la prueba de recuperación de conexión.

## Cobertura de las seis pruebas

1. **Mapa y dashboard:** 32 predicciones, datos contrastados con la API, polígonos realmente dibujados,
   clic en Baja California, sincronización con selector/detalle, controles de zoom, periodo histórico 2024,
   indicador nacional, búsqueda y descarga CSV.
2. **Tendencias y predicciones:** máximo de tres estados, separación intermedia/presidencial, cambio de indicador,
   conservación del estado entre secciones, nombre del modelo y MAE temporal de 2024.
3. **Simulador:** POST real, diferencia aritmética de +3 pp, resultado guardado y recuperado por ID en FastAPI,
   rechazo visual de resultados desactualizados, caso extremo +100 pp limitado a 0% de abstención,
   restablecer, valor vacío y cambio de territorio.
4. **Recuperación:** 503 visible, ausencia de predicciones inventadas, reintento y búsqueda sin coincidencias.
5. **Móvil y teclado:** 390×844, sin desbordamiento horizontal del documento, mapa dibujado, diálogo por teclado,
   Escape y devolución del foco, preferencia de movimiento reducido y simulación real.
6. **Proxy:** rutas desconocidas 404, escritura desde otro origen 403 y cuerpo no JSON 415.

Los escenarios de prueba generan registros reales e idempotentes en la base Docker local. No modifican
la predicción base ni borran datos. El ejemplo de Morelos con +3 pp devuelve aproximadamente 48.1% → 45.1%
de abstención y 51.9% → 54.9% de participación. Esto es un supuesto aritmético, no evidencia de intervención.

## Revisión visual y Better-UI

Inspección de capturas de escritorio 1440×1000 y móvil 390×844: estructura de las cuatro secciones,
jerarquía, tablas desplazables, mapa, bandas, estados base/resultado y disposición del simulador.
Se verificaron foco de diálogo y selección con teclado. Se revisaron en código estados de hover,
presionado, deshabilitado, carga, error y selección; los movimientos respetan la preferencia del usuario.
Los botones habilitados usan escala 0.96 en 150 ms, sin `transition: all`; los iconos comparten Lucide.

Correcciones verificadas: worker ESM y módulo compartido de MapLibre servidos localmente; señal de mapa
lista solo después de dibujar polígonos; estilos por feature-state sin reenviar 28.8 MB; etiqueta estable
para gráficos; nombre accesible del diálogo en móvil; validación del origen de POST compatible con el host local.

**No actionable UI-polish findings** dentro de las superficies y estados inspeccionados.
**Approve** para este alcance de revisión del prototipo.

**Not verified:** reproducción de transiciones al 10% en el panel Animations, lectores de pantalla,
auditoría exhaustiva de contraste/WCAG, Safari/Firefox, dispositivos físicos y prueba con usuarios.
La aprobación visual no certifica esas coberturas ni preparación operativa.

## Evidencias y límites

Playwright genera `frontend/test-results/results.json`, capturas y trazas solo en fallos; están ignorados por Git.
Las capturas de presentación se conservan en `docs/screenshots/`. El informe HTTP sin credenciales se guarda
en [frontend-backend-demo.json](frontend-backend-demo.json).
El resumen estructurado de la ejecución final, versión compilada y hashes está en
[frontend-validation.json](frontend-validation.json).

La API utilizada fue la del volumen local previamente restaurado. No se repitió la descarga/transformación
completa de 54.9 millones de celdas ni la validación contra Supabase remoto en esta entrega de frontend.
No se probó despliegue público, autenticación, concurrencia o recuperación de producción.
La cartografía original ocupa 28.8 MB y requiere WebGL2; una optimización verificable sigue pendiente.

Turbopack falló en este Windows al iniciar un proceso auxiliar de CSS. Se dejó Webpack explícito en scripts
de desarrollo y compilación; la compilación final y las pruebas se ejecutaron por esta ruta compatible.
