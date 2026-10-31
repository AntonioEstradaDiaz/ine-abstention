# Punto 3 · Diagnóstico de homologación municipal (Atlas De La Participación · Equipo Pumpkin)

Actualizado: 30 de octubre de 2026.

El punto 3 (datos territoriales completos) queda para la **siguiente etapa**: hay que homologar
municipios, distritos y secciones antes de mostrarlos, y mientras tanto esas opciones siguen
deshabilitadas en la app. Este diagnóstico **no cambia la app**. Mide con los datos que ya tenemos
cuánto cambian los municipios entre 2009 y 2024, para dimensionar ese trabajo.

- Datos: municipios del paquete de demo (`data/demo/`, restaurable con
  `python scripts/ci_fixtures.py restore`), con claves INE `EDOCVE:MPIOCVE`.
- Reproducir: `python scripts/report_municipal_changes.py` → [`punto3_diagnostico_municipal.json`](punto3_diagnostico_municipal.json)
  (detalle completo, municipio por municipio).
- Método: se comparan claves y nombres de cada elección con la anterior. Los nombres se comparan
  sin acentos, mayúsculas ni puntuación. No se consultaron decretos ni cartografía.

## Resumen

| Elección | 2009 | 2012 | 2015 | 2018 | 2021 | 2024 |
|----------|------|------|------|------|------|------|
| Municipios con datos | 2,458 | 2,455 | 2,458 | 2,463 | 2,468 | 2,477 |

- **2,453 municipios** conservan su clave en las seis elecciones y nunca la intercambian con otro.
  Reúnen el **99.64 % de la lista nominal de 2024** (97,974,192 de 98,330,348).
- **19 municipios nuevos** desde 2018, en 6 estados.
- **Claves que cambian de municipio** en Chiapas y Michoacán: unir los datos solo por clave
  mezclaría municipios distintos.
- **3 municipios sin datos en 2012** que sí aparecen antes y después.
- **40 cambios de nombre** que no cambian el municipio (abreviaturas, acentos, erratas de la fuente).

## Hallazgos

### 1. Municipios nuevos (19)

| Elección | Estado | Municipios |
|----------|--------|------------|
| 2018 | Chiapas | Emiliano Zapata, Mezcalapa, El Parral, Capitán Luis Ángel Vidal, Rincón Chamula San Pedro |
| 2021 | Campeche | Dzitbalché (en la fuente, "Dzitblache"), Seybaplaya |
| 2021 | Chiapas | Honduras de la Sierra (con la clave 07:124, que antes era de otro municipio) |
| 2021 | Morelos | Coatetelco, Xoxocotla |
| 2024 | Baja California | San Quintín, San Felipe |
| 2024 | Guerrero | Ñuu Savi, Las Vigas, San Nicolás, Santa Cruz del Rincón |
| 2024 | Morelos | Hueyapan |
| 2024 | Sinaloa | Eldorado, Juan José Ríos |

Cada municipio nuevo se separó de uno o más existentes. Esos municipios de origen **también dejan de
ser comparables**, aunque conserven su clave, y estos datos no permiten identificarlos: hace falta
consultar los decretos de creación o el catálogo del INEGI.

### 2. Claves que cambian de municipio

- **Chiapas, 2021:** las claves 07:120 a 07:124 se reordenaron. Por ejemplo, 07:121 era Mezcalapa
  en 2018 y El Parral en 2021. Además, Capitán Luis Ángel Vidal pasó de la clave 07:123 a la 07:119.
- **Michoacán, 2021 y 2024:** Paracho y Parácuaro **intercambian** las claves 16:065 y 16:066 en 2021
  y las recuperan en 2024.

Por eso la homologación necesita una **tabla de equivalencias por clave y año**; una unión directa
por clave daría series equivocadas.

### 3. Municipios sin datos en 2012

San Andrés Duraznal (Chiapas), San Francisco Nuxaño y San Juan Teita (Oaxaca) no aparecen en los
conteos de 2012, pero sí en 2009 y desde 2015. Deben tratarse como **dato faltante**, no como cero.

### 4. Cambios de nombre sin cambio de municipio (11 en 2021 y 29 en 2024)

Son de forma: abreviaturas ("General Bravo" → "Gral. Bravo" en Nuevo León), nombres largos o cortos
("Batopilas" → "Batopilas de Manuel Gómez Morín"), distritos en el nombre ("San Juan Mixtepec Dto 08")
y erratas de la fuente ("Hopelche}én", "Huitiupaán", "San Agustón Metzquititlán"). Para mostrarlos
conviene un nombre normalizado por clave, sin tocar las claves.

## Qué no cubre

- **Distritos y secciones:** el paquete agrega por municipio. Medirlos requiere los archivos crudos
  del INE (seis ZIP, unos 290 MB) y las equivalencias de la redistritación. Según el diccionario
  de datos, los distritos de 2009–2021 vienen en el marco cartográfico DERFE 2021 y los de 2024 en
  el de 2023 (ver [`phase2.md`](phase2.md)).
- **Cartografía municipal:** no se evaluó.

## Implicaciones para la siguiente etapa

1. **Tabla de equivalencias municipal** por clave y año, con fuente oficial para cada cambio.
2. **Unidades comparables:** juntar cada municipio nuevo con su municipio de origen para comparar
   entre elecciones.
3. **Faltantes y nombres:** tratar los huecos de 2012 como faltantes y usar un nombre normalizado
   por clave.
4. **Después, distritos y secciones**, con los archivos crudos y las equivalencias de la DERFE.

El 99.64 % de la lista nominal está en municipios con clave estable. Eso sugiere que un **primer nivel
municipal comparable** es alcanzable con relativamente poco trabajo, una vez identificados los
municipios de origen. Ese trabajo queda como **siguiente etapa**, y las opciones siguen deshabilitadas
hasta tener datos comparables.
