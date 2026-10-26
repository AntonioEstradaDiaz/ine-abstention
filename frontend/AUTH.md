# Acceso con Supabase Auth (configuración de Antonio)

Las pantallas `/login`, `/registro`, `/recuperar` y `/reset-password` usan usuarios reales de Supabase Auth. No hay usuarios ni contraseñas de demostración, ni credenciales guardadas en localStorage. El dashboard y las APIs `/api/backend/*` y `/api/assistant` requieren un usuario validado por Supabase. Sin configuración, el acceso queda cerrado y se muestra un aviso.

## Revisión del proyecto real

Revisión realizada el 25 de octubre de 2026. Los resultados son evidencia de esa fecha;
no representan una monitorización continua de la configuración.

Proyecto revisado: `ine-abstention` (`npzgdyyzdcsdadtfxhmr`). Estos resultados corresponden al
servicio remoto real, no a la fixture de Playwright. Son una revisión parcial: no acreditan
el recorrido completo de registro, confirmación, login, recuperación y logout con una cuenta válida.

| Comprobación | Resultado observado |
| --- | --- |
| Servicio Auth | `GET /auth/v1/settings`: HTTP 200. |
| Proveedor Email | Habilitado. |
| Registro público | Habilitado (`disable_signup=false`). |
| Confirmación de correo | Obligatoria (`mailer_autoconfirm=false`). |
| Acceso anónimo | Deshabilitado. |
| Otros proveedores públicos | Deshabilitados en la respuesta consultada. |
| Usuarios al iniciar la revisión | 0; ninguno con correo confirmado. |
| Auditor de seguridad de Supabase | Sin hallazgos reportados; no equivale a una auditoría exhaustiva. |
| Configuración local | `frontend/.env.local` creado con URL real y clave publicable, ignorado por Git; sin clave administrativa. |
| Site URL, allowlist de redirecciones, SMTP y plantillas | Pendientes de consultar en el panel autenticado. |
| Acceso administrativo | No había sesión autenticada en el panel durante la revisión; no se pudieron provisionar las cuentas ficticias mediante Auth Admin. |

### Dos cuentas ficticias solicitadas

El titular solicitó usar correos ficticios. Se intentó el registro público con direcciones
reservadas de `example.com`; Supabase rechazó ambas con HTTP 400 (`Email address ... is invalid`).
**Estas cuentas no fueron creadas y no pueden usarse para iniciar sesión.**

| Correo propuesto | Estado |
| --- | --- |
| `pulso.qa.20261025.1@example.com` | Registro rechazado; sin usuario creado. |
| `pulso.qa.20261025.2@example.com` | Registro rechazado; sin usuario creado. |

No se escribieron contraseñas, tokens ni claves en la documentación. No se modificó el esquema
administrado `auth`, ni se desactivó la confirmación de correo para forzar el registro.
Para provisionar cuentas ficticias confirmadas se necesita acceso administrativo al panel
o a la API Auth Admin; el conector disponible no expone esa operación. La sesión administrativa
del panel está pendiente. Los correos ficticios no permiten comprobar recepción de emails.

### Pruebas reales realizadas y límites

- Login sin usuario válido: HTTP 400, `Invalid login credentials`.
- Solicitud de recuperación para el correo ficticio: HTTP 200. Esta respuesta no prueba
  que exista la cuenta ni que se haya enviado o recibido un mensaje.
- Logout sin sesión: HTTP 401, exige un Bearer token válido.
- Login correcto, logout de una sesión válida, confirmación de registro y cambio efectivo
  de contraseña: **pendientes**, porque no hay cuentas de prueba válidas creadas.

Los endpoints se consultaron directamente contra el proyecto real. La suite automatizada
de navegador usa el servicio Auth local de CI y no sustituye esta aceptación remota.

Con el frontend en `http://127.0.0.1:3000` conectado a Supabase real también se comprobó:

- `/` sin sesión: HTTP 307 hacia `/login`.
- `/api/backend/predictions` y `/api/assistant` sin sesión: HTTP 401.
- `/auth/confirm` con token inválido y `/auth/callback` con código inválido:
  HTTP 307 hacia `/login?error=confirmation`.
- `/reset-password` sin sesión: HTTP 307 hacia `/recuperar`.
- `/login` muestra el formulario habilitado, sin el aviso de configuración faltante.

Para continuar se necesita una sesión administrativa autenticada en Supabase.
Las contraseñas y verificaciones deben introducirse directamente en el proveedor de identidad.

## Variables de entorno

En `.env.local` para desarrollo y en Vercel para cada entorno a desplegar:

```env
NEXT_PUBLIC_SUPABASE_URL=https://TU_PROYECTO.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_TU_CLAVE
NEXT_PUBLIC_APP_URL=https://TU_DOMINIO
```

Solo usar clave **publishable**, nunca `service_role` ni una clave secret. Estas dos variables públicas se incluyen en la compilación; después de agregarlas, reconstruir/redeploy. La clave privada de Groq sigue siendo solo del servidor. No se necesitan tablas nuevas ni acceso de administrador a la base de datos: los usuarios se gestionan en Auth.

## Configuración en el proyecto

1. Authentication → Providers: habilitar Email y confirmar que la confirmación de correo esté activada. Configurar contraseña mínima de 8 caracteres o superior.
2. Authentication → URL Configuration: establecer Site URL como la URL de producción. Autorizar las redirecciones exactas `https://TU_DOMINIO/auth/callback` y `https://TU_DOMINIO/auth/callback?next=/reset-password`. Para desarrollo, agregar sus equivalentes con `http://127.0.0.1:3000`.
3. Para confirmación de correo, se puede usar una plantilla con `{{ .RedirectTo }}` y el flujo PKCE del proveedor. Alternativa recomendada para confirmar en otro navegador: plantilla de confirmación con `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup` y plantilla de recuperación con `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery`.
4. Configurar SMTP propio para enviar a los evaluadores. El correo incorporado de Supabase tiene restricciones de destinatarios y frecuencia; no asumir que puede registrar a cualquier dirección sin SMTP.
5. Publicar el aviso de privacidad final y el contacto de ayuda de la instalación antes de abrir el registro. El texto de la interfaz es informativo para el prototipo, no un aviso institucional definitivo.
6. Mantener deshabilitado el registro anónimo. No hace falta desactivar la confirmación por correo.

## Prueba de aceptación con el proyecto configurado

- Abrir `/` sin sesión: redirige a `/login`. Las APIs privadas devuelven 401 (503 si falta configuración).
- Registrarse con un correo de prueba propio, recibir el mensaje y confirmar. Comprobar que sin confirmar no se permite iniciar sesión.
- Iniciar sesión; comprobar acceso al dashboard y consultas de IA.
- Cerrar sesión con el botón del encabezado y comprobar de nuevo que las APIs rechazan el acceso.
- Solicitar recuperación, abrir el enlace, establecer contraseña nueva e iniciar sesión con ella. La contraseña anterior debe fallar.
- Probar contraseñas distintas en registro, enlaces expirados y correo no confirmado.
- «Recordarme» controla cookies persistentes frente a cookies de sesión; el navegador puede restaurar cookies de sesión al restaurar ventanas según su configuración.

Las pruebas de aceptación con correo real requieren el proyecto y el servicio de email de Antonio.

## Pruebas de navegador sin credenciales reales

Playwright inicia `tests/fixtures/auth-server.mjs`, un servicio de prueba limitado a
`127.0.0.1:54321`. Simula únicamente login con contraseña, consulta del usuario, renovación
y logout. No es Supabase real ni valida correos, registro, recuperación o políticas RLS.
Sus usuarios, claves y tokens son sintéticos; nunca se usan en producción.

El proyecto `setup` inicia sesión desde `/login` con los clientes Supabase de la aplicación
y guarda cookies en `.playwright/auth/user.json` (ignorado por Git). Los tests del dashboard
reutilizan esa sesión; los de acceso denegado usan contextos sin sesión. Se comprueba también
que una cookie falsificada no da acceso. No existe un bypass de autenticación en el código de la app.

Para reproducir CI, usar una terminal dedicada y una compilación local de prueba. No sobrescribir `.env.local`:

```powershell
$env:NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321'
$env:NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_ci_fixture'
$env:NEXT_PUBLIC_APP_URL = 'http://127.0.0.1:3000'
$env:BACKEND_URL = 'http://127.0.0.1:8001'
npm.cmd run build
npm.cmd start
```

En otra terminal con `FRONTEND_URL=http://127.0.0.1:3000`, ejecutar `npm.cmd run test:e2e`.
El backend Docker debe estar preparado con datos reales. Al terminar, cerrar el servidor y
reconstruir con las variables reales antes de desplegar: las variables `NEXT_PUBLIC_` quedan
incluidas en el build. La fixture se inicia y detiene desde Playwright y no forma parte del despliegue.

## Diseño de las pantallas de acceso

`/login`, `/registro`, `/recuperar` y `/reset-password` comparten `src/components/auth-screen.tsx`
y `src/app/auth.css`. El panel izquierdo muestra el logotipo del INE, el mensaje «Tu participación
hace la diferencia.» como texto real y la ilustración `public/auth/participacion-ciudadana.webp`
(horizontal, se funde con el fondo del panel). En pantallas de hasta 860 px el panel queda arriba
del formulario. Las cifras de la ilustración son decorativas: no provienen del modelo ni del INE.
