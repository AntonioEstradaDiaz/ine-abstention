# Atlas · Equipo Pumpkin · Avance de los puntos 1–5

Base de desarrollo: `main` ecab6b5. Actualizado: 30 de octubre de 2026.
Estado: el punto 5 está en el PR #49 (CI en verde), pendiente de la configuración en Supabase y
Vercel y de revisión del equipo. El código del punto 1 está en la rama `feat/auth-correo`, pendiente
de PR y de la configuración de correo. Los puntos 2–4 siguen pendientes. Los puntos 6–9 ya se
entregaron (ver `docs/punto*.md`).

Prioridad acordada para el hackatón: **5 (cuotas de IA) → 1 (correos) → 2 (despliegue del
backend) → ensayo con varias cuentas**. Los puntos 3 y 4 quedan como siguiente etapa.

## Resumen

| Punto | Tema | Estado | Qué lo bloquea |
|-------|------|--------|----------------|
| 5 | IA preparada para varios usuarios | Implementado en `feat/ia-cuotas` | Acceso a Supabase y Vercel para desplegar |
| 1 | Registro y recuperación de cuentas | Código en `feat/auth-correo` | Dominio y proveedor SMTP; acceso a Supabase y al DNS |
| 2 | Backend y base de datos en producción | Pendiente | Decidir dónde se aloja FastAPI y su base |
| 3 | Datos territoriales completos | Siguiente etapa | Homologar municipios, distritos y secciones |
| 4 | Actualización de datos | Siguiente etapa | Definir el proceso de nuevas publicaciones del INE |
| — | Ensayo con varias cuentas | Pendiente | Puntos 1, 2 y 5 desplegados |

## Punto 5 · IA preparada para varios usuarios

### Objetivo

Antes, cualquier cuenta podía consultar al asistente sin tope y agotar la cuota compartida del
proveedor de IA, dejando el asistente sin servicio para todos. Ahora el uso tiene límites por cuenta
y para todo el servicio, y la persona siempre sabe por qué no puede consultar.

### Decisiones

- **Límites:** 30 consultas por cuenta al día, 5 por cuenta por minuto y 500 al día en total.
  El día se reinicia a las 00:00 de Ciudad de México.
- **Una falla del proveedor no se descuenta** de la cuota diaria de la cuenta. Sí cuenta para el
  ritmo por minuto y para el total diario, porque la consulta llegó al proveedor.
- **Si no se puede comprobar la cuota, la consulta se rechaza** (por ejemplo, si Supabase no
  responde). Protege la cuota y el costo; mientras tanto, Predicciones muestra la lectura
  automática y el diálogo de Análisis IA muestra el mensaje.
- **Tiempo máximo de 45 s** para la consulta: datos del INE, reserva de la cuota y respuesta del
  proveedor. Después, cerrar la reserva tiene su propio tope de 5 s (así el cupo se puede devolver
  aunque se hayan agotado los 45 s), y leer la cuota restante se corta a los 3 s. Antes podía
  llegar a 60 s con Groq, 75 s con Gemini y 135 s con Ollama, o no terminar si Supabase se colgaba.
- **Sin `service_role`.** Reservar y cerrar una consulta exige un secreto que solo conoce el
  servidor (`PULSO_AI_QUOTA_SECRET`); Supabase guarda solo su hash. Así nadie puede devolverse
  consultas llamando a la base desde la consola del navegador.
- **Privacidad:** solo se guarda cuenta, día, estado y hora; nunca el texto de preguntas o respuestas.
- **Limitación conocida:** las dos cuentas de demo del README son compartidas, así que su límite de
  30 al día se reparte entre todo el jurado. Si preocupa, crear más cuentas de demo.
- **Fuera de esta entrega:** evaluar la calidad de las respuestas (que correspondan al estado,
  periodo y fuentes seleccionados). Queda como siguiente etapa.

### Cambios (rama `feat/ia-cuotas`)

| Archivo | Cambio |
|---------|--------|
| `docs/sql/ai_quota.sql` | Nuevo. Tabla de uso, esquema privado con el hash del secreto y tres funciones: reservar, cerrar y consultar la cuota |
| `docs/sql/ai_quota_checks.sql` | Nuevo. Comprobaciones con las cuentas QA, en una transacción que se revierte |
| `frontend/src/lib/ai-quota.ts` | Nuevo. Mensajes en español, hora de reinicio y la lógica reservar → llamar a la IA → confirmar o liberar |
| `frontend/src/app/api/assistant/route.ts` | Aplica la cuota en POST, agrega la cuota restante en GET y el límite de 45 s |
| `frontend/src/lib/groq.ts`, `frontend/src/lib/gemini.ts` | Aceptan el límite de tiempo de la consulta; una respuesta que no es JSON se informa en español |
| `frontend/src/components/ai-assistant.tsx`, `frontend/src/components/analysis-view.tsx` | Contador "Te quedan N de 30 consultas hoy" y mensajes por causa |
| `frontend/AUTH.md`, `frontend/.env.example` | Guía de despliegue, rotación del secreto y nueva variable |
| `frontend/tests/` | Pruebas nuevas y fixture de pruebas con las funciones de cuota |

Commits: `80df496`, `4a693ee`, `8d02be2`, `7495118`, `50dd4ae`, `6d5204b` (implementación) y
`6ab5c07`, `13015fa`, `51b15d7`, `9717d6e`, `9c70d8a`, `ac77149` (correcciones tras las
revisiones, ver abajo).

### Qué ve la persona

- En Predicciones: "Te quedan 30 de 30 consultas hoy · se reinician a las 00:00 (hora del centro)".
  El número baja después de cada respuesta, también si la consulta se hizo desde Análisis IA.
- Al superar un límite, un mensaje específico: cuota diaria agotada, "vas muy rápido, espera N
  segundos", límite del servicio alcanzado, falla del proveedor o tiempo agotado. En Predicciones
  aparece además la lectura automática; en el diálogo de Análisis IA se muestra el mensaje.
- "No se descontó de tu cuota" solo aparece cuando la base de datos confirmó la devolución.

### Correcciones tras la revisión

Una revisión contra la spec dio "aprobado con pendientes" (ningún hallazgo crítico ni alto). Se
corrigieron:

- **Supabase colgado (medio):** antes, la consulta podía no terminar. Ahora se aplican los topes de
  45 s, 5 s y 3 s descritos arriba (`6ab5c07`).
- **Mensaje "No se descontó":** ya no se afirma si la devolución no se confirmó (`13015fa`).
- **Respuestas que no son JSON:** "Groq/Gemini/Ollama devolvió una respuesta inválida." en vez de
  un error técnico (`51b15d7`).
- **Contador desfasado:** consultar en Análisis IA actualiza el contador de Predicciones; el
  contador del diálogo ya no queda pegado al nombre del modelo (`9717d6e`).

Una segunda revisión dio de nuevo "aprobado con pendientes", solo con hallazgos bajos, también
corregidos:

- **Renovación de la sesión:** los topes de tiempo cortan también la espera previa a la petición a
  Supabase (por ejemplo, si su servicio de autenticación se cuelga al renovar la sesión) (`9c70d8a`).
- **Cuerpo `null` del proveedor:** se informa en español en vez de con un error técnico (`ac77149`).

Riesgo aceptado: mientras el proveedor de IA esté fallando, las fallas no descuentan cuota diaria,
así que una sola cuenta (a 5 por minuto) podría agotar el tope global de 500 en unos 100 minutos.

### Verificación realizada

- Pruebas unitarias del frontend: 53/53. `typecheck` y `build` de producción sin errores.
- SQL en un Postgres local (PGlite) que imita los roles y `auth.uid()` de Supabase: 12/12
  comprobaciones. Un control con el límite alterado sí falla, como debe.
- Prueba de la ruta compilada con la fixture de pruebas y un proveedor de IA simulado: 7/7, más
  6/6 con Supabase colgado y respuestas inválidas (45,0 s, 3,0 s y 45,0 s medidos).
- Revisión en Chrome de la interfaz compilada: 4/4, con capturas revisadas.
- **No verificado todavía:** la suite E2E completa (necesita el backend en Docker; correrá en el
  CI del PR), la ejecución del SQL en Supabase real y el tiempo agregado por la cuota (objetivo
  menor a 0,5 s).

### Cómo probar

En la rama `feat/ia-cuotas`, dentro de `frontend/`: `npm ci`, `npm run typecheck`,
`npm run test:unit` y `npm run build`. Para la base, seguir `frontend/AUTH.md`, sección
"Cuotas del asistente de IA" (esa sección llega con la misma rama).

### Pasos externos pendientes

Necesitan acceso que el código no puede sustituir. El orden importa: si el código se despliega
antes del SQL o del secreto, el asistente queda en "no disponible" y el resto de la app funciona.

1. Generar `PULSO_AI_QUOTA_SECRET` y aplicar `docs/sql/ai_quota.sql` en Supabase con su hash.
2. Ejecutar `docs/sql/ai_quota_checks.sql` y confirmar la fila `ai_quota_checks: todo OK`.
3. Medir el tiempo de reservar y cerrar una consulta (objetivo menor a 0,5 s).
4. Definir `PULSO_AI_QUOTA_SECRET` en Vercel (solo servidor) y desplegar.
5. Publicar la rama, abrir el PR y revisar el CI.

Los pasos 1–3 requieren acceso al proyecto de Supabase; el 4, a Vercel.

## Punto 1 · Registro y recuperación de cuentas

### Objetivo

Que cualquier persona del jurado cree su propia cuenta, la confirme y recupere su contraseña con
correos reales en español, en vez de depender de las dos cuentas de demo compartidas.

### Decisiones

- **Registro abierto** con confirmación por correo; las cuotas de IA del punto 5 acotan el abuso.
- **Sin rol de administrador** en Atlas: el equipo administra desde el panel de Supabase con una guía.
- **Botón "Reenviar confirmación"** tras registrarse, al intentar entrar sin confirmar y cuando el
  enlace venció; espera 60 s entre envíos y nunca revela si un correo tiene cuenta.
- **Correos en español** con el nombre Atlas, sin logotipo ni aval del INE, desde un remitente del
  equipo.
- **Enlaces que funcionan en cualquier dispositivo:** antes el enlace de registro solo funcionaba en
  el mismo navegador donde se hizo el registro.
- **Confirmación en dos pasos:** abrir el enlace muestra una página con un botón, y el enlace solo se
  usa al pulsarlo. Así los escáneres de correo (como Safe Links de Outlook) no lo gastan.

### Cambios (rama `feat/auth-correo`)

| Archivo | Cambio |
|---------|--------|
| `frontend/src/lib/auth-flow.ts` | Nuevo. Mensajes neutros, espera de reenvío y destino tras verificar un enlace |
| `frontend/src/app/auth/confirm/route.ts`, `frontend/src/app/confirmar/page.tsx` | Confirmación en dos pasos; un POST de otro origen se rechaza |
| `frontend/src/components/auth-screen.tsx`, `frontend/src/app/login/page.tsx`, `frontend/src/app/recuperar/page.tsx` | Botón de reenvío, enlaces a `/auth/confirm` y mensajes de enlace vencido |
| `frontend/tests/` | Pruebas unitarias, E2E de acceso y fixture de Auth extendida |
| `docs/auth/plantillas/` | Plantillas "Confirma tu cuenta de Atlas" y "Restablece tu contraseña de Atlas" |
| `docs/punto1-cuentas-correo.md`, `frontend/AUTH.md` | Runbook: correo, DNS, Supabase, prueba con buzones reales y administración |

Commits: `380d212`, `7d79925`, `4cc27e3`, `19c6be7`, `a6debb7` (implementación) y `f9e66c1`,
`c183a03`, `f0e3197`, `4c06fab` (correcciones tras la revisión, ver abajo).

### Correcciones tras la revisión

Una revisión contra la especificación encontró un problema grave antes de publicar nada:

- **Redirección de los correos (alto):** la primera versión cambiaba la redirección a
  `/auth/confirm`. Con las plantillas que Supabase tiene hoy, eso rompía la recuperación de
  contraseña si el código se desplegaba antes de pegar las plantillas nuevas. La redirección volvió a
  `/auth/callback` y ahora **el orden entre desplegar y cambiar las plantillas no importa**
  (`f9e66c1`). Se agregó la prueba del camino completo de recuperación.
- **Confirmar una cuenta a mano:** la guía documenta cómo hacerlo con la API de administración
  (`email_confirm`), sin guardar la clave secreta (`4c06fab`).
- **Botón de reenvío:** funciona sin Supabase configurado, no bloquea tras un error de conexión, usa
  el correo escrito y solo aparece en sus tres casos (`c183a03`).
- **Origen de las peticiones:** `/auth/confirm` compara también el protocolo (`f0e3197`).

### Verificación realizada

- Pruebas unitarias del frontend: 39/39. `typecheck` y `build` sin errores.
- E2E de acceso en Chrome con la fixture: 9/9 de `account-email` (reenvío y su espera, botón solo en
  sus casos, enlace que no se gasta al abrirlo, confirmación que entra al dashboard, recuperación
  completa, enlaces vencidos y rechazos) y las de login/logout existentes.
- **No verificado todavía:** la suite E2E completa (correrá en el CI del PR) y la prueba con buzones
  reales en Gmail y Outlook, que necesita la configuración de correo.

### Pasos externos pendientes

Todo está en `docs/punto1-cuentas-correo.md` (llega con la misma rama):

1. Elegir dominio y proveedor de correo; publicar SPF, DKIM y DMARC; desactivar el seguimiento de
   enlaces del proveedor.
2. En Supabase: SMTP propio, subir el límite de correos por hora (con SMTP propio empieza en 30),
   pegar las dos plantillas, Redirect URLs `/auth/callback` y contraseña mínima de 8.
3. Prueba con buzones reales (Gmail y Outlook).

La protección contra contraseñas filtradas solo existe en el plan Pro o superior de Supabase; si el
proyecto está en el plan gratuito, queda como riesgo aceptado.

**Bloquea:** dominio y proveedor SMTP, y acceso a Supabase y al DNS.

## Punto 2 · Backend y base de datos en producción

Pendiente. La protección del acceso directo a FastAPI ya está en el código (`API_INTERNAL_TOKEN`,
documentación desactivada en producción; ver `docs/punto8-operacion-seguridad.md`). Falta:

- Desplegar FastAPI con PostgreSQL/PostGIS y conectar el dashboard (`BACKEND_URL`,
  `BACKEND_API_TOKEN` igual a `API_INTERNAL_TOKEN`).
- Quitar `PULSO_PREVIEW=1` y probar la operación completa.
- Mantener FastAPI en red privada o detrás de TLS; el token no sustituye al firewall.

**Bloquea:** decidir dónde se alojan FastAPI y su base (Vercel no sirve para esta parte).

## Punto 3 · Datos territoriales completos

Siguiente etapa. Requiere homologar municipios, distritos y secciones entre elecciones e incorporar
sus estadísticas y cartografía. Mientras tanto, las opciones municipales siguen deshabilitadas.

## Punto 4 · Actualización de datos

Siguiente etapa. Hay un esqueleto en `pipelines/ingestion/`. Falta definir cómo incorporar nuevas
publicaciones del INE y automatizar validaciones y procedencia. Lo mínimo para el hackatón sería
mostrar en la interfaz la fecha y la versión de los datos utilizados.
