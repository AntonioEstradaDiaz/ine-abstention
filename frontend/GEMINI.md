# Configurar Gemini

1. Crea una clave en https://aistudio.google.com/apikey con tu cuenta y un proyecto con nivel gratuito disponible.
2. Copia `.env.example` a `.env.local` sin sobrescribir otras variables existentes.
3. Establece `AI_PROVIDER=gemini`, `GEMINI_API_KEY=tu_clave` y `GEMINI_MODEL=gemini-2.5-flash` (o un modelo disponible en tu proyecto).
4. Reinicia Next.js. En Predicciones, el estado «Gemini configurado» indica que existe una clave; la primera consulta comprueba su validez y la cuota.
5. También se usa desde Análisis → Preguntar a la IA. El servidor consulta los datos del INE; no confía en cifras enviadas desde el navegador.

La clave queda exclusivamente en el servidor. `.env.local` está excluido de Git. No la pegues en el chat ni uses `NEXT_PUBLIC_`. Los límites y modelos gratuitos dependen del proyecto de Google; esta integración no activa facturación. Los errores de cuota y configuración se muestran sin exponer la clave.

`PULSO_PREVIEW=1` usa la instantánea estatal del repositorio. Sin esa variable, se consulta `BACKEND_URL`. Los valores decorativos de Análisis no se usan como hechos para el asistente. El modelo explica los pronósticos existentes; esta conexión no reentrena el predictor.

Ollama sigue disponible mediante `AI_PROVIDER=ollama`, `OLLAMA_URL` y `OLLAMA_MODEL`.

Prueba local sin clave ni llamadas externas: `node --experimental-strip-types --test tests/gemini.test.mts`.
