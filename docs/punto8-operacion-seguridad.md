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

## Monitor periódico y alertas
Se añadió `.github/workflows/ops-watch.yml`: chequeo cada 30 minutos y bajo
ejecución manual. El operador debe configurar en GitHub Actions:
- Variable `PULSO_HEALTH_URL`: URL HTTPS terminada en `/api/v1/health/ready`.
- Secreto `PULSO_MONITOR_INTERNAL_TOKEN`: mismo token usado por FastAPI, con red
  accesible desde el runner. Si el backend es privado, instalar un runner privado
  en una red autorizada en lugar de exponer el puerto.
- Secreto `PULSO_ALERT_WEBHOOK`: URL HTTPS de un webhook compatible con
  JSON `{"text":"mensaje"}`.
Sin URL definida, el monitor informa explícitamente que no está configurado;
no se considera supervisión activa. Se debe probar una alerta deliberada y
su recepción externa antes de pasar a producción.

## Copias de respaldo y restauración
`scripts/ops_backup.py` usa `PULSO_BACKUP_DATABASE_URL` para crear un
`pg_dump -Fc` sin credenciales en argumentos, permisos locales 0600 y manifiesto
SHA-256. Ejemplos:
```bash
python scripts/ops_backup.py backup --directory /ruta/cifrada/respaldos
python scripts/ops_backup.py verify --archive /ruta/cifrada/respaldos/pulso-...dump
PULSO_RESTORE_ALLOWED=YES python scripts/ops_backup.py restore \
  --archive /ruta/cifrada/respaldos/pulso-...dump --confirm-restore
```
La restauración requiere `PULSO_RESTORE_DATABASE_URL` hacia una **base ya creada
y de nombre distinto** para que el ejercicio no sobreescriba producción. Guardar
las copias cifradas fuera del servidor, con retención y rotación declaradas.
En CI se crea un dump de la base de demo y se restaura en una segunda base;
se verifican registros territoriales y se destruye la base temporal.

**No cubre** la base administrada por Supabase Auth, los escenarios privados
ni las claves/proveedores: esos recursos precisan su propio proceso de
exportación segura, restauración y prueba con cuentas reales.

## Carga y aislamiento
En CI se ejecutan 24 solicitudes simultáneas con seis trabajadores al endpoint
de vida y se exige cero errores. Es una prueba sintética limitada, no un SLO
productivo. `scripts/ops_loadcheck.py` permite ampliarla de manera acotada
(máximo 300 peticiones y 20 trabajadores); reporta p50/p95.
También se agregaron dos identidades a la fixture Auth y un caso de Playwright
que comprueba que los registros de escenarios de un usuario no aparecen al
consultar con la sesión de otro, ni viceversa. **El aislamiento real de las
políticas RLS de Supabase debe ensayarse por separado** en el servicio real.

## Dependencias y secretos
`uv.lock` y `frontend/package-lock.json` fijan dependencias reproducibles.
`scripts/ops_repo_audit.py` rechaza nombres de archivos privados comunes que
lleguen a Git. La comprobación no detecta todos los secretos embebidos;
habilitar escaneo de secretos de GitHub, revisar avisos de dependencias,
rotar claves de prueba/producción en el gestor de secretos y restringir permisos
de los tokens de servicio. Las fallas de terceros y contingencias requieren
alertas centralizadas adicionales fuera de este repositorio.

## Checklist de salida
1. Credencial de API creada con 32+ caracteres en FastAPI y Next.js, HTTPS y
   comprobación de acceso denegado directo sin token.
2. Monitoreo real configurado y receptor de alertas probado; métricas observadas
   durante carga y fallo de base.
3. Respaldo automático cifrado fuera del servidor; recuperación de FastAPI Y
   Supabase probada en destino aislado; periodicidad y RPO/RTO aprobados.
4. Prueba de concurrencia representativa y aislamiento RLS con dos cuentas en
   Supabase de preproducción.
5. Dependencias/secretos auditados, responsables operativos y procedimiento de
   incidentes definidos. Hasta entonces el punto no acredita operación productiva.
