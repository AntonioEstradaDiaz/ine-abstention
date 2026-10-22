# Dashboard Pulso electoral

Frontend del prototipo INE Abstention. Cinco secciones conectadas a FastAPI:

- **Análisis IA:** modelos entrenados, evaluación temporal, explicaciones de variables y escenarios locales sobre los pronósticos.
- **Mapa de riesgo:** coropleta estatal real, selector territorial, filtros de riesgo, referencia histórica
  por elección, detalle, búsqueda y exportación CSV de las filas visibles.
- **Tendencias:** participación/abstención de hasta tres entidades; elecciones intermedias y presidenciales
  separadas, tabla con conteos y enlaces a las fuentes del backend.
- **Predicciones:** histórico frente a 2027, banda empírica, explicación exacta del baseline y comparación
  de modelos con métricas temporales reales.
- **Escenarios:** formulario y deslizador en puntos porcentuales, cálculo explícito mediante POST,
  resultados persistidos, límites, incertidumbre y reinicio. Cambiar parámetros o territorio invalida la salida anterior.

## Ejecutar

Node.js 24 y una API con los seis años, modelos y pronóstico 2027 materializado.

```powershell
cd frontend
npm.cmd ci
npm.cmd run dev
```

Dashboard: http://127.0.0.1:3000. Backend por defecto: http://127.0.0.1:8001.
Para otro backend, copiar `.env.example` a `.env.local` únicamente si no existe y ajustar:

```dotenv
BACKEND_URL=http://127.0.0.1:8000
```

`BACKEND_URL` es una variable del servidor. No usar prefijo `NEXT_PUBLIC_` ni colocar claves Supabase.
Al cambiarla, reiniciar Next.js. Las rutas del proxy son una lista cerrada: GET de lectura y POST de simulación.
El proxy exige JSON en escritura, rechaza orígenes ajenos, limita el cuerpo a 16 KiB y aplica tiempo máximo de 30 s.
Esto no sustituye autenticación ni controles de un despliegue público.

## Compilar y validar

```powershell
npm.cmd run typecheck
npm.cmd run build
npm.cmd start
# En otra terminal, con frontend y backend activos:
npx.cmd playwright install chromium
npm.cmd run test:e2e
```

Las pruebas usan por defecto frontend 3000 y backend 8001. `FRONTEND_URL` cambia la URL del dashboard.
Las simulaciones E2E crean registros reales, idempotentes, en la base del backend de pruebas. Usar Docker
local, no una base operativa. No se borran registros ajenos.
Los resultados JSON y capturas están en `test-results/`, ignorado por Git.

Los scripts de desarrollo/compilación usan Webpack: Turbopack falló en este Windows con
`node process exited before we could connect`. TypeScript y la compilación se validan sin omitir errores.

## Tecnologías y organización

Next.js App Router, React, TypeScript estricto, Tailwind CSS, Button manual de shadcn/ui,
Radix Dialog, Lucide, TanStack Query, MapLibre GL JS y Apache ECharts con renderizador SVG.
Versiones exactas en `package.json` y `package-lock.json`.

```text
src/app/                      Layout, página, tokens y estilos
src/app/api/backend/          Proxy de servidor hacia FastAPI
src/components/dashboard.tsx  Estado territorial compartido y mapa
src/components/trends.tsx     Comparación histórica
src/components/predictions.tsx Modelo, explicación y bandas
src/components/scenarios.tsx  Formulario y resultados del simulador
src/lib/api.ts                Cliente HTTP centralizado y errores
src/lib/types.ts              Contratos de la API consumida
public/geo/                   Polígonos INEGI y manifiesto de procedencia
scripts/                      Preparación del worker y descarga geográfica
tests/                        Pruebas Playwright con API real
```

Los estados de consulta incluyen carga, error, reintento y selección vacía. No se sustituyen errores con datos
inventados. La selección territorial se conserva entre secciones mientras la página permanece abierta.
No se persiste todavía en URL o almacenamiento local.

## Cartografía y worker

`public/geo/estados.geojson` proviene de `https://gaia.inegi.org.mx/wscatgeo/v2/geo/mgee/`.
El manifiesto contiene fecha UTC, tamaño, SHA-256 y claves 01–32. Se conserva la geometría sin simplificar.
Los polígonos se unen por `properties.cvegeo`; no se usan sus variables poblacionales como variables electorales.
Son límites geoestadísticos de referencia, no límites electorales homologados ni una serie geográfica histórica.

Para actualizar explícitamente la descarga y su manifiesto:

```powershell
npm.cmd run geo:download
```

MapLibre 6 requiere un worker ESM y su módulo compartido. `postinstall`, `predev` y `prebuild` copian ambos
y su licencia desde la versión instalada a `public/vendor/`, excluido de Git. Se sirven en el mismo origen,
sin CDN ni claves de mapas. La capa solo se declara lista después de cargar y dibujar polígonos.
Cambiar colores usa 32 estados de entidades; no vuelve a enviar toda la geometría al worker.
Si WebGL2 no está disponible, se ofrece la tabla como alternativa accesible.
Ver la [guía oficial de migración de MapLibre 6](https://maplibre.org/maplibre-gl-js/docs/guides/v5-to-v6-migration-guide/).

## Límites de interpretación

Todas las tasas observadas usan SV + NV. El indicador nacional ponderado y la media simple de los estados
están separados. Solo hay tres niveles de riesgo del backend. El modelo seleccionado es `baseline_last`;
los datos contextuales no se presentan como contribuciones causales. Las bandas de referencia no garantizan
cobertura del 90%. El escenario modifica una identidad aritmética, no el efecto de una campaña.

La API usa estado y pronóstico estatal 2027. Niveles municipales/distritales/seccionales están deshabilitados
con explicación. El frontend no añade nuevas migraciones, modifica modelos ni consulta directamente Supabase.
Pendientes de producto y producción: [hoja de ruta](../docs/project-status.md).

## Vista previa sin base de datos

Ejecuta `npm ci` y `npm run preview` en `frontend/`. Abre http://127.0.0.1:3000.
El modo usa los CSV de `data/samples/` empaquetados en `src/lib/preview-data.json`; el banner identifica la copia local.
Mapa, búsqueda, CSV, tendencias, predicciones y cálculo aritmético de escenarios funcionan sin FastAPI. Los escenarios locales no se guardan.
La selección de vista previa es explícita mediante `PULSO_PREVIEW=1`, solo en el servidor. `npm run dev` mantiene el proxy real y sus errores de conexión; no hay fallback automático.
Para regenerar la copia, desde la raíz ejecuta `python scripts/build_web_preview.py`. El script verifica bandas y categorías contra la calibración del backend. Los identificadores `preview-*` no son corridas persistidas. La fecha de la copia identifica el empaquetado, no el entrenamiento original.

## Análisis IA

Nueva sección con los seis estimadores entrenados del laboratorio: comparación temporal, pronóstico de la entidad seleccionada, síntesis automática basada en datos e importancia interna de variables. Los escenarios sobre cada pronóstico se calculan localmente y no se guardan; se pueden exportar junto con sus supuestos y la corrida utilizada.

El informe procede de `data/samples/ml_laboratory.json` y se regenera desde la raíz con `uv run python scripts/train_web_ml.py` tras instalar el grupo `ml`. El modo conectado consulta `/api/v1/ml/laboratory`; la vista previa sirve la misma corrida materializada. Los modelos no se entrenan desde el navegador ni requieren claves de un proveedor de IA.

## Mapa 3D

El mapa abre con perspectiva y polígonos estatales extruidos. La altura es proporcional a la tasa de abstención (escala visual exagerada, no relieve terrestre); el color conserva el riesgo relativo. Los controles 2D/3D, giro, brújula y encuadre de todo México no cambian datos, selección ni filtros. Los históricos usan la tasa observada del año seleccionado.

La representación usa la geometría INEGI existente y MapLibre, sin proveedores, claves o descargas cartográficas adicionales. Solo se actualizan los 32 estados de entidades al cambiar datos. Las transiciones de cámara respetan la preferencia de movimiento reducido. El selector y la tabla siguen disponibles como alternativa al mapa.

## Composición del mapa electoral

El mapa ocupa el ancho completo y usa la referencia visual aportada: tonos verde/amarillo/coral, volumen sombreado, tarjeta del estado seleccionado y leyenda de color y altura. El contorno blanco y el conector de la tarjeta se proyectan a la misma elevación que el estado mediante una capa Mercator personalizada de MapLibre; no son una imagen superpuesta.

La vista ampliada incluye los controles y la leyenda, permite salir con Escape y mantiene el foco de teclado dentro del mapa. El detalle completo de la entidad se conserva en un panel desplegable debajo. La tarjeta muestra datos reales de la aplicación, sin copiar los porcentajes ilustrativos de la referencia.
