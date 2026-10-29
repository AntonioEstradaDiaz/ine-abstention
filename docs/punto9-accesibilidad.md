# Punto 9 — Accesibilidad: auditoría inicial

Base: `main` 92b0ca9 (28 de octubre de 2026).

## Cambios propuestos en esta rama
- Navegación principal semántica con `nav` y nombre accesible.
- Aviso de cambio de sección mediante región `status`.
- Foco visible mejorado en teclado; soporte de movimiento reducido y colores forzados.
- Páginas públicas accesibles de privacidad, soporte y términos.
- Pruebas Playwright de teclado, títulos, navegación y desbordamiento móvil.

## Pruebas de aceptación que siguen pendientes
No declarar conformidad WCAG 2.2 AA sin auditoría ejecutada en el despliegue real.
Ejecutar pruebas con NVDA + Firefox/Chrome, VoiceOver + Safari, zoom 200/400%,
320 CSS px, contraste de textos/controles/estados, movimiento reducido y navegación
completa sólo con teclado. Verificar alternativas textuales y acceso a la selección
territorial del mapa MapLibre y gráficos ECharts. Complementar Playwright con axe-core
cuando se incorpore al lockfile y ejecutar correcciones por hallazgo.

Para cada fallo registrar pantalla, pasos, criterio WCAG, severidad, evidencia,
responsable, corrección y resultado de retest. Un test automático aislado no equivale
a una auditoría completa.
