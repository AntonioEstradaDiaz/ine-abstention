# Groq para la demo online

1. Inicia sesión en https://console.groq.com y confirma el plan gratuito y sus límites.
2. En https://console.groq.com/keys crea una clave llamada `ine-dashboard-demo`.
3. Guarda la clave exclusivamente en `frontend/.env.local` como `GROQ_API_KEY`. Usa `AI_PROVIDER=groq` y `GROQ_MODEL=qwen/qwen3.8-27b`, sujeto a disponibilidad de tu cuenta.
4. Reinicia Next.js. Prueba una consulta en Análisis o Predicciones. «Groq configurado» indica que hay una clave; la primera respuesta comprueba los permisos y la cuota.
5. Para publicar, añade estas tres variables en la configuración privada del hosting y vuelve a desplegar. No subas `.env.local` ni uses `NEXT_PUBLIC_`. Necesitas un hosting con servidor Next.js; no una exportación estática.
6. Configura `BACKEND_URL` con la URL accesible de tu backend. Si usas `PULSO_PREVIEW=1`, se consulta la instantánea del repositorio, no una base de datos en vivo.

El plan gratuito tiene límites compartidos por todos los visitantes de la demo. Esta integración no activa facturación ni cambia de proveedor automáticamente. Comprueba el plan y los límites en https://console.groq.com/docs/rate-limits. No garantiza disponibilidad ilimitada.

El modelo explica los datos estatales y los pronósticos que el servidor consulta. No inventa métricas municipales ni reentrena el predictor. Las cifras decorativas de Análisis pueden diferir del contexto que recibe la IA; se indica en el diálogo.

Los errores de autenticación, modelo, cuota o conexión no exponen respuestas internas ni claves. Gemini y Ollama siguen disponibles si se seleccionan explícitamente con `AI_PROVIDER`.

Pruebas sin API real: `node --experimental-strip-types --test tests/groq.test.mts tests/gemini.test.mts`.

## Despliegue temporal en Vercel (Antonio)

1. Importar `AntonioEstradaDiaz/ine-abstention` desde la cuenta propietaria del repositorio.
2. Elegir la rama `main`, que ya incluye la integración de Groq y la configuración de la demo.
3. Framework: **Next.js**. Root Directory: **frontend**. Mantener el build `npm run build` y la salida predeterminada de Next.js.
4. En Environment Variables agregar, para el entorno que se vaya a desplegar:

```env
AI_PROVIDER=groq
GROQ_API_KEY=CLAVE_PRIVADA_DE_GROQ
GROQ_MODEL=qwen/qwen3.8-27b
PULSO_PREVIEW=1
```

`CLAVE_PRIVADA_DE_GROQ` es un marcador: Antonio debe sustituirlo por una clave válida en Vercel, nunca en un archivo del repositorio. Puede crear una clave propia desde su cuenta de Groq. No necesita claves de Gemini ni Ollama.

5. Desplegar; si se agregaron variables después del primer despliegue, hacer **Redeploy**.
6. Abrir el enlace público, seleccionar Yucatán en Análisis y usar **Preguntar a la IA**. También probar el asistente de Predicciones. Una respuesta de Groq debe mostrarse con datos del estado; «configurado» por sí solo no confirma una respuesta real.
7. Para los evaluadores, compartir la URL de producción accesible sin iniciar sesión y comprobarla en una ventana privada.

Esta demo sirve los datos y pronósticos de la instantánea del repositorio. `PULSO_PREVIEW=1` evita depender de localhost o de una base de datos externa; no es una conexión al backend real. Para usar el backend desplegado, quitar esta variable y establecer `BACKEND_URL` con su URL pública.

Al finalizar la evaluación, eliminar el despliegue y revocar la clave temporal. GitHub Pages no ejecuta esta API de Next.js.

## Acceso de usuarios

El dashboard y la API requieren inicio de sesión. Antes de probar Groq en el despliegue, completar la configuración de Supabase Auth documentada en `AUTH.md` y crear una cuenta confirmada. Sin las variables de Supabase, el acceso permanece cerrado.
