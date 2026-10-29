# Punto 8: operación y seguridad (entrega técnica)

Estado inicial: `main` 0eb8ace (28/oct/2026). Esta rama introduce controles operativos,
**no configura automáticamente infraestructura ni secretos del despliegue**.

## Protección del backend directo
- En `ENVIRONMENT=production`, FastAPI requiere al arrancar `API_INTERNAL_TOKEN`
  (32+ caracteres aleatorios), rechaza `DEBUG=true` y CORS comodín.
- `/api/v1/health` sigue siendo una comprobación de vida pública. El resto de rutas
  `/api/v1/*`, incluido `/health/ready` y `/health/metrics`, exige la cabecera
  `X-Pulso-Internal-Token`. Los docs OpenAPI se desactivan en producción.
- El servidor Next.js envía el secreto mediante `BACKEND_API_TOKEN`, únicamente
  desde el servidor (no `NEXT_PUBLIC_`). El navegador nunca recibe el secreto.
- **La cabecera no sustituye al firewall**: exponer FastAPI sólo en red privada
  o detrás de un proxy con TLS; girar la credencial ante sospecha de exposición.
- Demo local `ENVIRONMENT=local-demo`: sin token conserva las pruebas existentes
  y sólo debe enlazarse a loopback. Si se configura uno, el acceso queda protegido.

## Observabilidad
- JSON por petición con timestamp, estado HTTP, clase de ruta, latencia, método e ID
  de petición. No se guardan consultas, URL completa, tokens, identificadores de usuarios,
  cookies, correos ni cuerpos de las peticiones.
- `X-Request-ID` admite 1–64 caracteres seguros; otro valor se sustituye.
- `GET /api/v1/health/metrics` devuelve contadores in-memory con cardinalidad
  limitada: peticiones, errores 5xx, concurrencia actual y uptime. Son por proceso,
  no agregados globales ni persistentes. Para varios workers hay que exportar datos
  a observabilidad central y definir SLO/alertas reales.
- La ruta de readiness consulta la base y esquema; no debe publicarse sin control.

## Elementos externos por activar
- Monitoreo periódico/alertas: configurar URL, acceso del runner y webhook en el
  gestor de secretos. Sin URL se omite deliberadamente; no se inventan alertas.
- Respaldos PostgreSQL: cuenta dedicada, `pg_dump`, verificación, almacenamiento
  cifrado externo y pruebas de restauración aisladas.
- **Supabase Auth y escenarios privados no están incluidos en `pg_dump` de la
  base FastAPI**. Exigen un plan/backup independiente y verificación RLS entre
  cuentas. No proclamar recuperación integral sin ese plan.
- Cargas concurrentes: las pruebas sintéticas locales no sustituyen un ensayo
  bajo tráfico real, varias instancias y límites de proveedores.

Revisar la matriz completa de pendientes y resultados de CI antes de producción.
