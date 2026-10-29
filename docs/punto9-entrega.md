# Punto 9 — Entrega del proyecto

## Estado verificado
FastAPI + PostgreSQL/PostGIS y Alembic en la raíz; Next.js 16, React 19,
Supabase Auth, MapLibre y ECharts en `frontend/`. Reportes estatales PDF/Excel
e historial privado de escenarios ya implementados. `PULSO_PREVIEW=1` utiliza
instantánea de demo y no comprueba el backend en producción.

## Instalación y verificación reproducible
1. Clonar el repositorio y fijar revisión. Seguir [docs/installation.md](installation.md)
   y [docs/docker_validation.md](docker_validation.md) para backend y fixtures.
2. Preparar `.env` a partir de ejemplos sin copiar secretos al control de versiones.
3. Para frontend: Node 24, `cd frontend`, `npm ci`, copiar `.env.example` a
   `.env.local` y configurar `BACKEND_URL`, las variables publicables de
   Supabase y `NEXT_PUBLIC_APP_URL`.
4. El operador puede definir `SUPPORT_CONTACT_EMAIL` y `DATA_CONTROLLER_NAME`
   en el entorno de Next.js (no secretos). Verificar su veracidad antes del lanzamiento.
5. Ejecutar `npm run typecheck`, `npm run build`, `npm run test:unit`.
   Para Playwright, preparar el servidor, fixtures de autenticación y
   `npm run test:e2e`. Documentar los resultados reales; no presuponer éxito.
6. Verificar HTTPS, permisos, recuperación y confirmación por correo, integridad
   de fuentes, reportes, aislamiento de escenarios, límites de IA y respaldo.

## Antes de entregar para uso público
Completar auditoría WCAG y sesiones con usuarios; verificar la identidad y domicilio
del responsable y aprobar aviso de privacidad; configurar correo real y soporte;
decidir licencia del código con sus titulares. Ver
[punto9-accesibilidad.md](punto9-accesibilidad.md),
[punto9-pruebas-usuario.md](punto9-pruebas-usuario.md),
[LICENCIA_PENDIENTE.md](LICENCIA_PENDIENTE.md).
No publicar contraseñas, tokens, cookies, claves de API ni datos personales.
