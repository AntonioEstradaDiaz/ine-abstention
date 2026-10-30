# Punto 7 · Reportes y escenarios

Base de desarrollo: `main` 92b0ca9; rama `feature/punto-7-reportes-escenarios`.
Estado: implementación sujeta a CI, revisión humana y aprobación del equipo.

## Reportes ya implementados
- PDF/Excel **estatales** y un historial de descargas de sesión (existentes).
- **Nacional**: resumen histórico de conteos SV/NV/NS y tasas recalculadas
  mediante suma de conteos, tabla de las 32 predicciones estatales y conteos por
  nivel de riesgo. PDF y Excel descargables con procedencia y limitaciones.
- Para el periodo futuro 2027, **no se publica una tasa nacional estimada**:
  sólo existen pronósticos por entidad. Promediar tasas estatales sin pesos
  adecuados no equivale al indicador nacional.
- Histórico: cada elección se documenta separadamente por año y tipo; no
  inferir tendencias que mezclan presidenciales e intermedias indiscriminadamente.

## Escenarios
- El cálculo de escenario individual, su autenticación y su historial
  privado se mantienen sin cambios.
- El nuevo comparador simultáneo permite elegir **2–6 entidades**,
  introducir un supuesto común en puntos porcentuales y observar abstención
  base, abstención hipotética, cambio aplicado y riesgo relativo antes/después.
- La fórmula es la sensibilidad aritmética documentada:
  `clip(abstencion_base - cambio_pp/100, 0, 1)`.
  Traslada los extremos de banda y usa los umbrales de riesgo de la corrida.
- **Importante**: este comparador opera en el navegador y no persiste resultados.
  CSV incluye el identificador de corrida y la selección. No estima efectos
  de campañas, políticas, intervenciones ni participación nacional.

## Elementos aún pendientes
- Reportes **municipales**: mantener opción deshabilitada hasta tener homologación
  oficial entre años, procedencia, cartografía y tasas comparables.
- **PowerPoint**: aún no se habilita. Requiere generador validado, con
  gráficos y referencia temporal, y pruebas de apertura en aplicaciones destino.
- **Programación de envíos**: no existe SMTP y sistema de trabajos programados
  robusto. Debe implementarse con autorización por usuario, validación de
  destinatarios, cuotas, deduplicación, trazabilidad y manejo de errores.

## Validación
Ejecutar `npm run typecheck`, `npm run build`, `npm run test:unit`
y `npm run test:e2e` desde `frontend` en el entorno de CI.
Verificar controles de la vista nacional, descarga PDF/Excel, reportes
estatales originales y escenarios guardados separados entre cuentas.
Las pruebas de exportación no constituyen validación estadística operativa.

## UI
Paleta existente Atlas De La Participación: blanco, magenta `#e5007e`, rosa pastel
`#fce7f2`, azules oscuros para lectura, tarjetas y bordes redondeados;
comportamiento responsivo con tablas desplazables horizontalmente.
