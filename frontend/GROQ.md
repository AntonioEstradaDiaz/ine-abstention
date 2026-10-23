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
