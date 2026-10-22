# Fase 2: fuentes oficiales e ingesta CCPC

## Fuente y alcance

La convocatoria adjunta, páginas 2 a 4, exige aprovechar los CCPC 2009–2024.
El Reto 2 pide series territoriales, datos sociodemográficos agregados, escenarios y un semáforo.
Los entregables posteriores incluyen un reporte metodológico, un mapa de escenarios y la base
CSV/XLSX utilizada. Esta fase prepara la base verificable; todavía no entrena modelos ni crea mapas.

Fuente primaria: [plataforma CCPC del INE](https://ine.mx/transparencia/datos-abiertos/visualizacion-datos/conteos-censales-participacion/).
Método y fórmulas: [manual oficial](https://ine.mx/wp-content/uploads/2025/06/Manual-Conteos-Censales-2009-2024.pdf),
especialmente páginas 17 y 18. Las definiciones de campos provienen además del TXT incluido en cada ZIP.

Se descargaron los seis ZIP oficiales enlazados desde esa página: 2009, 2012, 2015, 2018, 2021 y 2024.
Cada ZIP contiene **32 CSV estatales y un diccionario TXT**, además de la entrada de directorio.
Los 192 CSV tienen las mismas 16 columnas, codificación UTF-8 y separador coma.
La serie tiene seis elecciones; no son observaciones anuales.

El inventario reproducible completo, URLs, fechas de recuperación, tamaños y SHA-256 está en
`docs/data_inventory.json`. Los ZIP originales están en `data/raw/ccpc/<año>/original.zip` y no se modifican.
Los originales no se incluyen en Git ni se suben a PostgreSQL; se pueden recuperar con el catálogo.

| Elección | Filas agregadas originales | Entidades y municipios | Desgloses demográficos cargados |
| --- | ---: | ---: | ---: |
| 2009 | 8,706,843 | 2,490 | 23,204 |
| 2012 | 8,604,456 | 2,487 | 23,160 |
| 2015 | 9,106,059 | 2,490 | 23,213 |
| 2018 | 9,251,122 | 2,495 | 23,266 |
| 2021 | 9,430,502 | 2,500 | 23,323 |
| 2024 | 9,773,730 | 2,509 | 23,487 |
| **Total** | **54,872,712** | **14,971** | **139,653** |

Los registros originales son celdas agregadas por territorio, sexo y edad; no personas identificadas.
Los registros territoriales cargados incluyen 32 entidades por año y los municipios que aparecen
en cada fuente. Una repetición de código entre años no establece equivalencia geográfica municipal.

## Variables realmente disponibles

| Campo original | Significado verificado y tratamiento |
| --- | --- |
| `AELEC` | Año de elección; se valida contra el ZIP. |
| `FELECCION` | Fecha original. 2009–2021 usan día/mes/año; 2024 contiene `06/02/2024` y se interpreta como 2 de junio. |
| `EDOCVE`, `EDONOM` | Clave INE y nombre de entidad. Clave conservada con dos dígitos. |
| `MPIOCVE`, `MPIONOM` | Clave INE y nombre municipal. No se asume equivalencia automática con códigos INEGI. |
| `SECCION` | Sección del año correspondiente, según el diccionario. No se carga como serie homologada. |
| `TIPOSEC` | `U`: urbana; `M`: mixta; `R`: rural. Se conserva un margen territorial de cada categoría. |
| `DEF`, `DEL` | Distrito federal y local. El diccionario de 2009–2021 refiere cartografía DERFE 2021; el de 2024 refiere 2023. |
| `SEXO` | `0`: hombres; `1`: mujeres. `2`: no binario aparece en 2024. No se imputa esa categoría a años anteriores. |
| `EDAD` | Edad cumplida en la elección; se conserva en los originales. Se agregan bandas 18–24, 25–34, 35–44, 45–59 y 60+. |
| `LN` | Lista nominal de cuadernillos de las casillas catalogadas. |
| `SV` | Registros con marca de voto. |
| `NV` | Registros sin marca de voto. |
| `NS` | Participación no especificada por cuadernillos o páginas sin información/disponibilidad. |

No aparecen en estos CSV escolaridad, ingreso, marginación, identificadores indígenas/afromexicanos
ni geometrías. Que el tablero ofrezca un filtro no implica que el ZIP descargable contenga su variable.
Estas variables requerirán fuentes complementarias verificadas y una unión geográfica documentada.

## Corrección del denominador

El diseño preliminar usaba `1 - SV/LN`. Esa fórmula incorpora `NS` al complemento y sobreestima
la abstención observada cuando hay registros sin información. Se aplica la definición del manual:

- Participación observada: `SV / (SV + NV)`.
- Abstención observada: `NV / (SV + NV)`.
- Fracción sin información: `NS / LN`.
- Identidad validada: `LN = SV + NV + NS`.

La base calcula las tasas con columnas generadas de PostgreSQL. Un denominador cero produce `NULL`,
nunca una tasa inventada. No se promedian tasas para agregar territorios: primero se suman conteos.
`NS` se conserva para evaluar cobertura e incertidumbre; excluirlo del denominador no elimina el
posible sesgo por información faltante. En 2024 hay 6,325,654 registros no especificados de 98,330,348
en lista nominal. La calidad deberá considerarse antes de entrenar y comparar modelos.

## Comparabilidad y hallazgos

La página del tablero describe una cartografía de mayo de 2023, pero los diccionarios de los ZIP
históricos refieren distritos DERFE 2021. No se presume que los ZIP ya tengan la homologación del tablero.
Cada territorio se registra como una instantánea vinculada a su fuente y año. Los municipios llevan
`comparability_status=requires_crosswalk`; no están listos para formar una serie predictiva municipal
sin una tabla de correspondencias. Las entidades conservan `state_code_stable`, identificando continuidad
de código, sin afirmar equivalencia de toda la cobertura de cuadernillos entre elecciones.

En 2024 hay **20,912 filas con `DEL` vacío**. Se conservan y no impiden agregados estatales/municipales.
No se imputa distrito local ni se utilizan estas filas para un mapa distrital. Se detectaron edades máximas
entre 117 y 140 según el año. Se conservan como datos atípicos de origen; no se recortan automáticamente.

Los diccionarios advierten que los conteos no incluyen votación de casillas especiales ni del extranjero.
No deben sustituirse por resultados de cómputos distritales: corresponden a fuentes y universos distintos.
Se separan elecciones presidenciales (2012, 2018, 2024) de intermedias (2009, 2015, 2021).

La plataforma también enlaza ZIP de voto anticipado 2024, prisión preventiva 2024 y Poder Judicial 2025.
Se identificaron sus enlaces, pero no se descargaron ni mezclaron en esta serie. Tienen modalidades o
procesos distintos. El catálogo inicial se limita a los seis ZIP de elecciones federales ordinarias.

## Carga en Supabase

Todas las tablas pertenecen al esquema privado `ine`:

- `data_sources`: URL, SHA-256, inventario del ZIP y reporte de calidad.
- `elections`: seis elecciones, sus fechas y tipos.
- `territories`: instantáneas estatales y municipales, con referencia cartográfica y comparabilidad.
- `participation_records`: conteos territoriales y tasas con denominador explícito.
- `demographic_participation`: márgenes por sexo, banda de edad y tipo de sección.
- `ingestion_runs`: versión `ccpc-v1`, fechas y resultado de cada carga completada.

Los márgenes demográficos son distribuciones separadas, no un cruce sexo × edad × tipo de sección.
No se deben sumar categorías de distintas dimensiones entre sí. Tampoco se deben sumar estados
con sus municipios, porque representan la misma población en dos niveles de agregación.

Las seis tablas tienen RLS y políticas de lectura para `ine_api`. Las inserciones se ejecutan con
`ine_migrator`, propietario de las tablas; `anon` y `authenticated` carecen de acceso al esquema privado.
La revisión de seguridad de Supabase no reportó hallazgos después de la carga.
El tamaño observado de toda la base después de cargar es aproximadamente 51 MB.

## Reproducir

Desde la raíz del proyecto, usando el `.env` configurado para Supabase:

```powershell
uv sync --locked
uv run python scripts/inspect_ccpc.py
uv run python scripts/prepare_ccpc.py
uv run alembic upgrade head
uv run python scripts/load_ccpc.py
uv run python scripts/report_ccpc.py
```

Se pueden pasar años concretos, por ejemplo `uv run python scripts/prepare_ccpc.py 2024`.
Preparación e inspección no modifican Supabase. La carga es una transacción por elección y comprueba
los SHA-256 del ZIP y los Parquet. Un fallo revierte ese año completo. Los reportes de validación
rechazada quedan localmente; no se descartan ni corrigen filas de forma silenciosa.

Una fuente ya cargada con el mismo checksum y versión se omite. Se verificó repitiendo los seis años:
todos devolvieron `skipped` y no aumentaron los registros. Una nueva versión del ZIP para un año ya
cargado requiere revisión explícita, evitando duplicar poblaciones o reemplazar observaciones sin control.
Un bloqueo transaccional evita cargas simultáneas del mismo conjunto.

Los informes completos y Parquet están en `data/processed/ccpc/<año>/`. Una muestra real de 192
registros estatales, con tasas y sin datos personales, se conserva en `data/samples/ccpc_states.csv`.

## Consulta y verificación

```text
GET /api/v1/data-sources
GET /api/v1/elections
GET /api/v1/participation/history?territory_type=state&state_code=17
GET /api/v1/participation/history?territory_type=municipality&year=2024&state_code=17
```

Las fuentes y el historial están paginados. El historial devuelve el denominador y la condición de
comparabilidad de cada territorio. Los códigos territoriales son claves INE, no códigos geométricos
listos para unir a cualquier mapa.

```powershell
uv run ruff check .
uv run ruff format --check .
uv run pytest
$env:RUN_INTEGRATION = '1'
uv run pytest
Remove-Item Env:RUN_INTEGRATION
```

Las pruebas de integración de ingesta requieren las seis elecciones cargadas; las unitarias no usan
red. Se verificaron las reglas de conteos, fechas, duplicados, categorías, márgenes y consultas reales.

## Pendientes metodológicos para las siguientes fases

1. Adquirir geometrías oficiales y verificar sus claves y fechas antes de construir el mapa.
2. Crear correspondencias temporales municipales/seccionales o comenzar modelos a nivel entidad.
3. Incorporar datos sociodemográficos complementarios sin usar información posterior a la elección objetivo.
4. Tratar `NS`, diferencias de cobertura y cambios territoriales en la evaluación del modelo.
5. Exportar la base final del mapa y documentar sus restricciones cuando se construyan los escenarios.
