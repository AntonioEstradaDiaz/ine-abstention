# Atlas · Equipo Pumpkin · Avance de los puntos 1–5

Base de desarrollo: `main` ecab6b5. Actualizado: 29 de octubre de 2026.
Estado: el punto 5 está implementado en la rama `feat/ia-cuotas`, pendiente de PR, CI y revisión
del equipo. Los puntos 1–4 siguen pendientes. Los puntos 6–9 ya se entregaron (ver `docs/punto*.md`).

Prioridad acordada para el hackatón: **5 (cuotas de IA) → 1 (correos) → 2 (despliegue del
backend) → ensayo con varias cuentas**. Los puntos 3 y 4 quedan como siguiente etapa.

## Resumen

| Punto | Tema | Estado | Qué lo bloquea |
|-------|------|--------|----------------|
| 5 | IA preparada para varios usuarios | Implementado en `feat/ia-cuotas` | Acceso a Supabase y Vercel para desplegar |
| 1 | Registro y recuperación de cuentas | Pendiente | Acceso a Supabase y un proveedor SMTP |
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

Pendiente. Las pantallas de registro, confirmación y recuperación ya existen. Falta configuración:

- SMTP propio en Supabase. Sin él, el correo incorporado limita destinatarios y frecuencia.
- Plantillas de confirmación y recuperación con `{{ .SiteURL }}/auth/confirm?token_hash=...`.
- Probar con buzones reales: registro, confirmación, recuperación y nueva contraseña.
- Activar la protección contra contraseñas filtradas (aviso de Supabase Advisors).
- Definir si hace falta un rol de administrador. Hoy todas las cuentas son `authenticated`.

**Bloquea:** acceso al proyecto de Supabase y elegir un proveedor SMTP. Detalle en `frontend/AUTH.md`.

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
