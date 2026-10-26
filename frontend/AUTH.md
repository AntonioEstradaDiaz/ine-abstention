# Acceso con Supabase Auth (configuración de Antonio)

Las pantallas `/login`, `/registro`, `/recuperar` y `/reset-password` usan usuarios reales de Supabase Auth. No hay usuarios ni contraseñas de demostración, ni credenciales guardadas en localStorage. El dashboard y las APIs `/api/backend/*` y `/api/assistant` requieren un usuario validado por Supabase. Sin configuración, el acceso queda cerrado y se muestra un aviso.

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

No hay datos de prueba inventados de autenticación. Las pruebas reales de correo y sesión requieren el proyecto y el servicio de email de Antonio.
