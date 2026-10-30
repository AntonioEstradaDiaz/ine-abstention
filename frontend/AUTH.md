# Acceso con Supabase Auth (configuración de Antonio)

Las pantallas `/login`, `/registro`, `/recuperar` y `/reset-password` usan usuarios reales de Supabase Auth. La aplicación no contiene credenciales predefinidas ni las guarda en localStorage. Las cuentas QA creadas en el proyecto real se documentan a continuación. El dashboard y las APIs `/api/backend/*` y `/api/assistant` requieren un usuario validado por Supabase. Sin configuración, el acceso queda cerrado y se muestra un aviso.

## Revisión del proyecto real

Validación realizada el **26 de octubre de 2026**, contra `ine-abstention`
(`npzgdyyzdcsdadtfxhmr`). Se usó el frontend local `http://127.0.0.1:3000`, la API Docker
local con datos oficiales y el servicio remoto real de Supabase Auth. Esta prueba no utilizó
la fixture de CI ni validó un despliegue público.

### Configuración observada en la prueba local inicial

| Comprobación | Resultado |
| --- | --- |
| Servicio Auth | HTTP 200 en `/auth/v1/settings`. |
| Proveedor Email y registro público | Habilitados. |
| Confirmación global de correo | Obligatoria; se conservó `mailer_autoconfirm=false`. |
| Acceso anónimo | Deshabilitado. |
| Site URL | `http://localhost:3000`. No equivale al origen local utilizado, `http://127.0.0.1:3000`. |
| Redirect URLs | Lista vacía. Falta autorizar los callbacks exactos del entorno elegido. |
| SMTP personalizado | Deshabilitado. |
| Plantillas | Predeterminadas; el panel indica que se necesita SMTP personalizado para editarlas. |
| Configuración local | URL real y clave publicable en `.env.local`, ignorado por Git; sin clave administrativa en el frontend. |

En esa revisión inicial se observaron las URLs y SMTP sin modificarlos. Los cambios posteriores
de dominio y callbacks se documentan en la sección del despliegue público. Sigue pendiente validar
el correo con buzones reales controlados. La ausencia inicial de SMTP personalizado y de
redirecciones era una limitación adicional; el error concreto observado al
solicitar recuperación de estas cuentas fue la validación de la dirección ficticia.

### Cuentas ficticias creadas

Se crearon mediante **Authentication → Users → Add user → Create new user**, con confirmación
individual activada. Ese mecanismo no envía correo de confirmación y no prueba que exista el buzón.
No se escribieron registros directamente en el esquema administrado `auth` ni se cambió la
política global de confirmación. Las cuentas son usuarios normales de la aplicación, sin acceso
administrativo al panel de Supabase.

| Correo | Identificador en Auth | Estado comprobado |
| --- | --- | --- |
| `pulso.qa.20261025.1@example.com` | `ecaa829b-f3ac-4d28-aaaa-60371b5cde22` | Confirmado; login y logout aprobados. |
| `pulso.qa.20261025.2@example.com` | `3a84200f-6a36-4161-aba9-bcedf42d1735` | Confirmado; login y logout aprobados. |

Las contraseñas aleatorias originales no se guardaron. El **29 de octubre de 2026**, por autorización
del responsable del proyecto, se sustituyeron por una contraseña pública compartida para las pruebas
del hackathon: consultar la tabla de [acceso de prueba del README](../README.md#acceso-de-prueba-para-el-hackathon).
Las cuentas conservan el rol normal `authenticated` y el correo confirmado. Sus escenarios son de
prueba y no deben contener información personal. Estos buzones ficticios no permiten recuperación
por correo; cualquier cambio posterior de contraseña debe reflejarse en el README.

Ese mismo día se verificaron login con la nueva contraseña, consulta del usuario validada por el
servidor y logout de ambas cuentas contra Supabase real, sin la fixture local de CI.

### Resultados del recorrido real

| Flujo | Resultado y alcance |
| --- | --- |
| Creación administrativa | Ambas cuentas visibles en el panel y confirmadas mediante consulta de lectura. |
| Login, cuenta 1 | Acceso al dashboard y carga de los 32 estados con backend conectado. |
| Login incorrecto, cuenta 2 | Contraseña errónea rechazada con mensaje de credenciales inválidas. |
| Login correcto, cuenta 2 | Acceso al dashboard con sesión real. |
| Logout de ambas cuentas | Regreso a `/login`; acceso privado denegado tras logout de la primera cuenta. Consulta posterior: cero sesiones para cada usuario. |
| Validación de registro | El formulario rechazó contraseñas distintas antes de enviar el registro. |
| Registro público | En el intento previo del 25 de octubre, ambas direcciones fueron rechazadas con HTTP 400. No se presenta la creación Admin como registro público completo. |
| Recuperación | El formulario mostró error; la consulta directa devolvió HTTP 400: `Email address ... is invalid`. |
| Confirmación por email y nueva contraseña | No verificadas: no hay buzones reales ni enlace de recuperación utilizable. |

La consulta de lectura de `auth.users` comprobó correo confirmado e inicio de sesión en ambas
cuentas. La consulta de `auth.sessions` comprobó cero sesiones restantes tras cerrar sesión.
Esto no demuestra revocación inmediata de todos los JWT ya emitidos: el comportamiento de
expiración de access tokens es distinto del cierre de la sesión y sus refresh tokens.

También se verificaron previamente los controles sin sesión: `/` redirige a `/login`, ambas APIs
privadas responden 401, los callbacks inválidos vuelven a `/login?error=confirmation` y
`/reset-password` sin sesión redirige a `/recuperar`. La suite automatizada de navegador usa
una fixture Auth local y no sustituye estas pruebas remotas.

## Despliegue público verificado el 26 de octubre de 2026

- URL: https://pulso-electoral-demo.vercel.app.
- Site URL de Supabase actualizado a ese origen. Redirect URLs guardadas:
  `https://pulso-electoral-demo.vercel.app/auth/callback` y
  `https://pulso-electoral-demo.vercel.app/auth/callback?next=/reset-password`.
- Login real con la cuenta QA 1 y carga de los 32 estados aprobados. Logout volvió al login;
  después, `/api/backend/predictions` y `/api/assistant` mostraron
  `Inicia sesión para continuar.` y `/` volvió a la pantalla de acceso.
- Se conservan confirmación global obligatoria y acceso anónimo deshabilitado.
  SMTP personalizado continúa deshabilitado; no se validó entrega de correo ni cambio de contraseña.
- El despliegue usa una instantánea (`PULSO_PREVIEW=1`), no el backend Docker de la prueba local.

## Variables de entorno

En `.env.local` para desarrollo y en Vercel para cada entorno a desplegar:

```env
NEXT_PUBLIC_SUPABASE_URL=https://TU_PROYECTO.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_TU_CLAVE
NEXT_PUBLIC_APP_URL=https://TU_DOMINIO
```

Solo usar clave **publishable**, nunca `service_role` ni una clave secret. Estas dos variables públicas se incluyen en la compilación; después de agregarlas, reconstruir/redeploy. La clave privada de Groq sigue siendo solo del servidor. Los usuarios se gestionan en Auth. El historial de escenarios utiliza además `public.pulso_scenarios`, con RLS por propietario y sin clave administrativa; ver [entrega del hackathon](../docs/hackathon-delivery.md).

## Configuración en el proyecto

Los pasos completos (proveedor de correo, DNS, Supabase, prueba con buzones reales y administración
de cuentas) están en [`docs/punto1-cuentas-correo.md`](../docs/punto1-cuentas-correo.md). Resumen:

1. Authentication → Providers: habilitar Email y confirmar que la confirmación de correo esté activada. Configurar contraseña mínima de 8 caracteres o superior.
2. Authentication → URL Configuration: establecer Site URL como la URL de producción. Autorizar `https://TU_DOMINIO/auth/confirm` y, para enlaces antiguos, `https://TU_DOMINIO/auth/callback`. Para desarrollo, agregar sus equivalentes con `http://127.0.0.1:3000`.
3. Plantillas de correo en español: pegar [`docs/auth/plantillas/confirmar-cuenta.html`](../docs/auth/plantillas/confirmar-cuenta.html) en "Confirm sign up" y [`docs/auth/plantillas/restablecer-contrasena.html`](../docs/auth/plantillas/restablecer-contrasena.html) en "Reset password". Sus enlaces usan `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email` (o `type=recovery`): funcionan en cualquier navegador y pasan por la página `/confirmar`, así que los escáneres de correo no gastan el enlace.
4. Configurar SMTP propio para enviar a los evaluadores. El correo incorporado de Supabase solo envía a miembros del equipo del proyecto y como máximo 2 correos por hora; con SMTP propio el límite inicial es de 30 por hora y se ajusta en Rate Limits.
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
