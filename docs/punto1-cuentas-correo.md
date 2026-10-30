# Punto 1 · Cuentas y correos (Atlas · Equipo Pumpkin)

Runbook para dejar el registro, la confirmación y la recuperación de cuentas funcionando con
correos reales, y para administrar cuentas desde Supabase.

Estado: el código está en la rama `feat/auth-correo`. Lo que sigue requiere acceso al proyecto de
Supabase, a un proveedor de correo (SMTP) y al DNS del dominio. Referencias de Supabase consultadas
el 30 de octubre de 2026.

## Qué cambia para la persona usuaria

- Se registra con su correo y recibe un correo en español: "Confirma tu cuenta de Atlas".
- El enlace funciona en cualquier navegador o dispositivo. Abre la página `/confirmar` con un botón;
  el enlace solo se usa al pulsar el botón, así que los escáneres de correo (como Safe Links de
  Outlook) no lo gastan.
- Si no le llega el correo o el enlace venció, puede pedir otro con "Reenviar confirmación"
  (una vez por minuto). El mensaje nunca revela si un correo tiene cuenta.
- La recuperación de contraseña funciona igual: correo en español, botón y contraseña nueva.

## 1. Proveedor de correo y dominio

El servidor de correo incorporado de Supabase **no sirve para registro abierto**: solo envía a
miembros del equipo del proyecto y como máximo 2 correos por hora
([Supabase · Custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp)).

Decidir una opción:

| Opción | Remitente | Entrega |
|--------|-----------|---------|
| A (recomendada) | Dominio del equipo, p. ej. `no-responder@<dominio>` | Mejor: SPF, DKIM y DMARC propios |
| B | Remitente del proveedor, sin dominio propio | Más riesgo de spam |

Proveedores que menciona Supabase: Resend, AWS SES, Postmark, Twilio SendGrid, ZeptoMail y Brevo.

Pasos con el proveedor:

1. Crear la cuenta y verificar el dominio.
2. Publicar en el DNS los registros **SPF, DKIM y DMARC** que indique el proveedor.
3. Crear credenciales SMTP (host, puerto, usuario y contraseña). Guardarlas en un gestor de
   contraseñas; **nunca** en el repositorio ni en un `.env` versionado.
4. **Desactivar el seguimiento de enlaces ("link tracking")** del proveedor: reescribe los enlaces
   de los correos y puede romperlos.

## 2. Supabase Auth

1. **SMTP** (Authentication → SMTP Settings): activar el SMTP propio con host, puerto (normalmente
   587), usuario, contraseña, remitente `no-responder@<dominio>` y nombre del remitente **Atlas**.
2. **Rate Limits** (Authentication → Rate Limits): al activar SMTP propio el límite inicial es de
   **30 correos por hora**. Subirlo según lo esperado en el hackatón (p. ej. 100 por hora). Los
   intervalos por usuario de confirmación y recuperación son de 60 s por defecto: dejarlos así,
   coinciden con la espera del botón de reenvío.
3. **Email Templates** (Authentication → Email Templates):
   - **Confirm sign up**: asunto "Confirma tu cuenta de Atlas"; cuerpo de
     [`docs/auth/plantillas/confirmar-cuenta.html`](auth/plantillas/confirmar-cuenta.html).
   - **Reset password**: asunto "Restablece tu contraseña de Atlas"; cuerpo de
     [`docs/auth/plantillas/restablecer-contrasena.html`](auth/plantillas/restablecer-contrasena.html).
   - Pegar solo el `<div>` (el comentario del inicio es para el repositorio) y escribir el asunto en
     el campo de asunto de cada plantilla.
   - Verificar después de pegar: enviar un correo de prueba y comparar con el archivo del repositorio.
4. **URL Configuration**: Site URL = URL de producción (las plantillas arman su enlace con ella). En
   Redirect URLs, autorizar `https://<producción>/auth/callback` y
   `https://<producción>/auth/callback?next=/reset-password`, más sus equivalentes con
   `http://127.0.0.1:3000` para desarrollo. Es la redirección que envía la app; la usan las
   plantillas predeterminadas de Supabase.
5. **Email provider**:
   - Confirmación de correo obligatoria (ya está activa) y registro anónimo deshabilitado.
   - Longitud mínima de contraseña: 8 o más.
   - Vigencia del enlace ("Email OTP Expiration"): 1 hora, que es lo que dicen las plantillas.
   - **Protección contra contraseñas filtradas** (Q-002): disponible **solo en el plan Pro o
     superior** ([Password security](https://supabase.com/docs/guides/auth/password-security)).
     Si el proyecto está en el plan gratuito, queda como riesgo aceptado.

El orden entre desplegar el código y cambiar las plantillas no rompe nada:

- La app sigue enviando `/auth/callback` como redirección. Con las plantillas predeterminadas, los
  enlaces funcionan como hoy (abriéndolos en el mismo navegador del registro).
- Las plantillas nuevas enlazan a `/auth/confirm` por su cuenta, y `/auth/confirm` en `main` ya
  verifica `token_hash`.
- La protección contra escáneres de correo y los enlaces que funcionan en cualquier dispositivo
  están completos cuando ya están las dos cosas: el código nuevo y las plantillas nuevas.

## 3. Prueba con buzones reales

Dos personas del equipo, una con Gmail y otra con Outlook, después de desplegar:

1. Registrarse en `/registro`.
2. Comprobar que el correo llega a la **bandeja de entrada** (no a spam) en menos de 2 minutos, en
   español, con el nombre Atlas y sin logotipo del INE.
3. Abrir el enlace **en otro dispositivo** (p. ej. el celular): debe mostrar "Confirma tu cuenta de
   Atlas" y, tras el botón, entrar al dashboard.
4. Antes de confirmar, intentar iniciar sesión: debe pedir confirmar el correo y ofrecer el reenvío.
5. Pedir el reenvío dos veces seguidas: la segunda debe esperar.
6. Abrir de nuevo un enlace ya usado: debe volver al inicio de sesión con el mensaje de enlace
   vencido y la opción de reenviar.
7. Recuperar la contraseña desde "¿Olvidaste tu contraseña?", elegir una nueva y entrar con ella;
   la anterior debe fallar.
8. Anotar resultados (proveedor de correo, tiempo de llegada, carpeta) en el PR.

Las cuentas de demo del README usan correos ficticios: siguen entrando con su contraseña, pero no
pueden recuperar la contraseña por correo.

## 4. Administración de cuentas (sin rol de administrador en Atlas)

Todas las cuentas de Atlas son iguales; el equipo administra desde el panel de Supabase.

| Tarea | Cómo | Nota |
|-------|------|------|
| Ver cuentas | Authentication → Users | También: `select id, email, created_at, email_confirmed_at from auth.users;` (solo lectura) |
| Borrar una cuenta | Authentication → Users → la cuenta → borrar | Las sesiones ya abiertas siguen válidas hasta que vence su token (por defecto, 1 hora). Borra también sus escenarios y su uso de IA (`on delete cascade`) |
| Confirmar a mano | API de administración: `auth.admin.updateUserById(id, { email_confirm: true })` (ver abajo) | Documentado por Supabase. Si el panel ofrece confirmar, también sirve. No escribir en el esquema `auth` |
| Bloquear temporalmente | API de administración: `auth.admin.updateUserById(id, { ban_duration: "24h" })` (ver abajo) | Un bloqueo impide iniciar sesión, pero no cierra las sesiones abiertas. Si el panel ofrece bloquear, también sirve |
| Forzar recuperación | Pedir a la persona que use "¿Olvidaste tu contraseña?" | Si el panel ofrece enviar el correo de recuperación, usarlo; la documentación consultada no lo describe |
| Consumo de IA | Consulta comentada al final de `docs/sql/ai_quota.sql` (SQL Editor) | Disponible cuando se aplique el punto 5 (PR #49) |

Ante un abuso durante el hackatón, lo más rápido es borrar la cuenta; los límites de registro por IP
(30 solicitudes cada 5 minutos, por defecto) y las cuotas de IA ya acotan el daño.

### Ejecutar una acción de la API de administración

La API de administración usa la **clave secreta** del proyecto (`sb_secret_…`, antes `service_role`),
que salta RLS. Úsala solo en una máquina de confianza y **nunca** la guardes en el repositorio, en un
`.env` versionado ni en el navegador.

1. Copia el identificador (`id`) de la cuenta desde Authentication → Users.
2. En una terminal, dentro de `frontend/` (ahí está instalado `@supabase/supabase-js`), define las dos
   variables solo para esa sesión (PowerShell):

   ```powershell
   $env:SUPABASE_URL = "https://<ref>.supabase.co"
   $env:SUPABASE_SECRET_KEY = "<clave secreta>"
   ```

3. Ejecuta la acción. Para confirmar el correo:

   ```powershell
   node -e "const {createClient}=require('@supabase/supabase-js');const s=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SECRET_KEY,{auth:{persistSession:false}});s.auth.admin.updateUserById(process.argv[1],{email_confirm:true}).then(r=>console.log(r.error?r.error.message:'Cuenta confirmada'))" "<id-de-la-cuenta>"
   ```

   Para bloquear 24 horas, cambia `{email_confirm:true}` por `{ban_duration:'24h'}`.
4. Cierra la terminal (o borra las variables) al terminar.

Referencia: [`auth.admin.updateUserById`](https://supabase.com/docs/reference/javascript/auth-admin-updateuserbyid).

## 5. Reversión

- Restaurar las plantillas predeterminadas en Email Templates.
- Volver a desplegar la versión anterior del frontend.
- El SMTP propio puede quedarse activo; no afecta a la versión anterior.

## Referencias

- [Email templates](https://supabase.com/docs/guides/auth/auth-email-templates) (variables y "Email prefetching")
- [Custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp)
- [Rate limits](https://supabase.com/docs/guides/auth/rate-limits)
- [Password security](https://supabase.com/docs/guides/auth/password-security)
- [Managing user data](https://supabase.com/docs/guides/auth/managing-user-data)
