# Asistente con horizonte seleccionable

El usuario elige un año futuro respecto del último dato observado (hasta 2100) y
un tipo de referencia: intermedia o presidencial. Elegir un año no acredita la
existencia de una elección en él. No se predice participación mes a mes.

Cuando coincide con el pronóstico registrado en el contexto y su corte cubre los
datos, se muestra ese pronóstico y se conserva su incertidumbre experimental.
Para los demás horizontes se calcula una proyección hipotética de referencia
constante: NV / (SV + NV) de la última elección observada del mismo tipo y entidad.
No se entrenó otro modelo ni se incorpora una tendencia futura. Dos años del mismo
tipo pueden dar la misma cifra por definición de este supuesto. Los horizontes
lejanos debilitan la plausibilidad del supuesto; no existe precisión ni banda
calibrada para ellos. No se recicla la clasificación, el ranking o el MAE de 2027.

La fuente, el año de referencia, el corte y el método acompañan a la cifra. Los
conteos inválidos, duplicados y falta de historial comparable producen un mensaje
explícito, sin una cifra de reemplazo. Cambiar horizonte o datos vacía el chat;
respuestas tardías de otro contexto se descartan.

Los números se calculan de manera determinista. El servidor reconstruye el
contexto desde la API, sin aceptar estadísticas del navegador. Groq, Gemini y
Ollama explican ese contexto; no generan nuevas cifras en texto. Si falla el
proveedor, la lectura automática conserva el horizonte y se identifica como tal.

El asistente admite sugerencias generales de calidad de datos, evaluación de
modelos y accesibilidad del dashboard con responsables, plazos orientativos y
criterios verificables. No prescribe campañas ni intervenciones para influir en
la participación electoral de territorios o grupos específicos, ni promete efectos
causales sobre los votos.

Validación: pruebas unitarias del cálculo, invalidación por datos más recientes,
rechazo de horizontes inválidos, coherencia del contexto y prueba Playwright de
selección de 2030/2036, porcentajes, conversación y validación del servidor.
