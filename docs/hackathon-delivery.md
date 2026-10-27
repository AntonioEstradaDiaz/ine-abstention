# Entrega del hackathon

## Alcance acordado

- Publicar Análisis con datos oficiales y las cuentas de prueba documentadas en README.
- Guardar escenarios por usuario y recuperarlos después de recargar o volver a iniciar sesión.
- Descargar reportes estatales PDF y XLSX.
- Retirar la muestra municipal hasta contar con homologación oficial.

La demo conserva su instantánea oficial versionada. No necesita desplegar FastAPI para guardar
escenarios: Next.js calcula sobre la instantánea y guarda el resultado en Supabase con la sesión
del usuario. En modo backend, el resultado se calcula en FastAPI y se guarda también en el
historial privado de Supabase.

## Escenarios

`GET /api/backend/simulations?state_code=17` devuelve los últimos 20 escenarios de la entidad
para el usuario autenticado. `POST /api/backend/simulations` valida los parámetros, calcula en
el servidor y guarda antes de confirmar éxito. Un error de almacenamiento no se anuncia como
guardado. Se conservan resultado, supuestos, corrida, identificador y fecha.

La tabla `public.pulso_scenarios` tiene RLS y permisos SELECT/INSERT para `authenticated`.
Las políticas exigen `auth.uid() = user_id`. No se utiliza `service_role`. La migración remota
`hackathon_scenarios` se aplicó al proyecto existente; copia de su SQL en
`docs/sql/hackathon_scenarios.sql` para revisar o preparar otro entorno. No volver a ejecutar
ese CREATE TABLE sobre una base donde ya existe.

En la base real se verificó dentro de una transacción revertida:

1. El usuario QA 1 puede insertar y consultar su escenario.
2. QA 2 no puede consultar ese escenario.
3. QA 2 no puede insertar un escenario a nombre de QA 1.

Supabase Advisors no reportó problemas de RLS en la tabla. Su aviso preexistente de protección
contra contraseñas filtradas deshabilitada sigue fuera del alcance de esta entrega.

La interfaz permite recuperar escenarios de la misma corrida. Si la base predictiva cambia,
conserva el registro histórico pero deshabilita su recuperación sobre la nueva corrida.

## Reportes

PDF: entidad, estimación, banda, hallazgos seleccionados, histórico con conteos SV/NV/NS,
comparación nacional ponderada cuando se elige, gráficas opcionales separadas por tipo electoral,
corrida/modelo y límites metodológicos. No usa logotipo institucional ni afirma aval del INE.

XLSX: hojas Resumen, Historico y Metodologia. Conteos y tasas se guardan como números;
las tasas tienen formato porcentual. Incluye procedencia y configuración de la comparación.

El botón espera a que los datos necesarios estén disponibles. El estado de generación bloquea
dobles clics y muestra errores. Las últimas cinco configuraciones descargadas pueden descargarse
de nuevo mientras permanece abierta la sección; ese listado no constituye un archivo persistente.

PowerPoint, reportes nacionales/municipales y programación de envíos siguen deshabilitados.
Las notas metodológicas son obligatorias; la casilla lo indica. Excel entrega tablas, no gráficas.

## Datos municipales

Datos ya no importa ni sirve la muestra ilustrativa. El selector municipal está deshabilitado y
explica la necesidad de homologación. Las exportaciones disponibles son nacionales y estatales.

## Validación

- 13 pruebas unitarias frontend aprobadas, incluidos PDF real y reapertura de XLSX con conteos,
  tasas y procedencia comprobados.
- TypeScript y compilación de producción aprobados durante la implementación.
- PDF de prueba renderizado: ambas páginas revisadas visualmente, sin texto cortado.
- 12 comprobaciones de navegador aprobadas en modo instantánea con fixture Auth/PostgREST:
  guardado y recuperación tras recargar, PDF y Excel de la entidad elegida, retirada municipal,
  navegación móvil y regresiones de las secciones. La primera ejecución venció durante la
  compilación inicial de desarrollo; la segunda pasó con el servidor compilado.
- Dependencias fijadas; override `uuid@11.1.1` corrige la dependencia transitiva de ExcelJS.
  `npm install` reportó cero vulnerabilidades después del ajuste.
- La fixture Auth/PostgREST es exclusiva de pruebas locales y CI. No se importa en la aplicación.
  Las comprobaciones de RLS anteriores se ejecutaron contra Supabase real, separadamente.

La presentación, video de respaldo y ensayo con el jurado quedan a cargo del resto del equipo.
