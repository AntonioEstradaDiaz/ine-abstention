# Atlas De La Participación · Equipo Pumpkin · Configuración pendiente en Supabase y Vercel

Actualizado: 30 de octubre de 2026.

El código de los puntos 5 (cuotas de IA, PR #49) y 1 (cuentas y correos, PR #51) ya está en `main`
y en la demo de Vercel. A los dos les falta configuración que solo puede hacer quien tiene acceso al
proyecto de Supabase y a Vercel. Los pasos están ordenados por prioridad.

## 🔴 Urgente · Punto 5: cuotas del asistente de IA (unos 10 minutos)

Mientras no se hagan estos pasos, **el asistente de IA de la demo responde "No pudimos verificar tu
cuota. El asistente no está disponible por ahora."** Así está diseñado: si no puede contar las
consultas, no deja usar la IA. El resto de la aplicación funciona normal.

Hacerlo en este orden:

1. **Generar el secreto** en una máquina de confianza. El comando imprime el secreto y su hash:

   ```
   node -e "const c=require('crypto');const s=c.randomBytes(32).toString('base64url');console.log('PULSO_AI_QUOTA_SECRET='+s);console.log('sha256='+c.createHash('sha256').update(s).digest('hex'))"
   ```

   Guardar el secreto en un gestor de contraseñas. No compartirlo por chat ni subirlo al repositorio.
2. **En el SQL Editor de Supabase**, ejecutar `docs/sql/ai_quota.sql`. Es una sola vez.
3. **Guardar solo el hash**, nunca el secreto:

   ```sql
   insert into pulso_private.settings(key, value) values ('ai_quota_secret_sha256', '<sha256>')
   on conflict (key) do update set value = excluded.value;
   ```

4. **Correr las comprobaciones** con `docs/sql/ai_quota_checks.sql`. Corre dentro de una transacción
   que se revierte, así que no deja datos. Debe terminar con una fila **`ai_quota_checks: todo OK`**;
   si aparece algún `FAIL: …`, compartir el texto con el equipo.
5. **En Vercel**, agregar la variable `PULSO_AI_QUOTA_SECRET` con el secreto del paso 1. Va solo en el
   servidor, sin `NEXT_PUBLIC_`.
6. **Volver a desplegar** (Redeploy) para que la variable surta efecto.

**Comprobación:** entrar con una cuenta de demo y abrir Predicciones. Debe aparecer "Te quedan N de
30 consultas hoy", y el número baja al hacer una consulta.

Límites: 30 consultas por cuenta al día y 5 por minuto, con un tope de 500 al día para todo el
servicio. El día se reinicia a las 00:00 de la Ciudad de México. Las dos cuentas de demo son
compartidas, así que sus 30 consultas diarias se reparten entre todo el jurado.

Detalle completo en `frontend/AUTH.md`, sección "Cuotas del asistente de IA". Para revertir, las
instrucciones están al final de `docs/sql/ai_quota.sql`.

## 🟡 Siguiente · Punto 1: correos reales

El registro y la recuperación **siguen funcionando como antes**, así que esto no rompe nada mientras
tanto. Pero con el correo que trae Supabase por defecto **solo llegan correos a miembros del proyecto,
y como máximo 2 por hora**. Para que el jurado pueda registrarse con su propio correo:

1. **Decidir proveedor y remitente.** Recomendado: Resend, Brevo o similar, con un dominio propio del
   equipo para no caer en spam. Publicar SPF, DKIM y DMARC y **desactivar el seguimiento de enlaces**
   del proveedor.
2. **En Supabase → Authentication:**
   - **SMTP Settings:** activar el SMTP propio con remitente "Atlas De La Participación".
   - **Rate Limits:** subir el límite de correos a unos 100 por hora (empieza en 30).
   - **Email Templates:** pegar las plantillas "Confirma tu cuenta de Atlas" y "Restablece tu
     contraseña de Atlas" de `docs/auth/plantillas/`.
   - **URL Configuration:** confirmar que la Site URL sea `https://pulso-electoral-demo.vercel.app` y
     autorizar en Redirect URLs `/auth/callback` y `/auth/callback?next=/reset-password`.
   - **Email provider:** contraseña mínima de 8 caracteres.
3. **Probar con un Gmail y un Outlook reales**, siguiendo la sección 3 del runbook.

Todo está paso a paso en `docs/punto1-cuentas-correo.md`. La protección contra contraseñas filtradas
solo existe en el plan Pro de Supabase; en el plan gratuito queda como riesgo aceptado.
