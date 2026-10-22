# Fase 6: simulador territorial de participación y abstención

## Alcance implementado

El simulador compara dos escenarios sobre predicciones estatales ya materializadas:

1. **Base o continuidad:** conserva el pronóstico de la fase 5, sus bandas y sus umbrales.
2. **Hipotético:** aplica un cambio absoluto supuesto en participación, en puntos porcentuales.

Se puede seleccionar una entidad, un grupo de entidades o las 32. El cambio general admite
mejoras y deterioros. Cada entidad puede tener un cambio propio, que **reemplaza** al general;
no se suman ambos cambios. No se reentrena el modelo ni se modifican los datos de origen.
La base actual corresponde al escenario intermedio 2027, con corte histórico 2024.

## Supuestos y fórmulas

Para una abstención base `a` y un cambio supuesto `d` en puntos de participación:

```text
abstención_simulada = min(1, max(0, a - d / 100))
participación_simulada = 1 - abstención_simulada
cambio_participación_aplicado_pp = 100 * (a - abstención_simulada)
cambio_abstención_aplicado_pp = -cambio_participación_aplicado_pp
```

`+3` significa tres puntos porcentuales adicionales de participación; no significa un aumento
relativo del 3%. Los resultados comparan tasas sobre el denominador conocido `SV + NV`,
con NS excluidos, igual que la predicción base. No se estiman números de electores futuros.

Los límites físicos son 0% y 100%. Si el cambio solicitado supera el margen disponible,
se devuelve el cambio realmente aplicado y se marca `point_was_clipped`. Por ejemplo,
una abstención de 2% con un supuesto de +5 puntos de participación termina en abstención 0%,
con mejora aplicada de 2 puntos. Es un ejemplo aritmético, no un dato territorial observado.

El cambio se supone fijo, conocido y uniforme dentro de cada entidad. No se estima la
eficacia de campañas, políticas o intervenciones. No hay inferencias causales, individuales,
partidistas ni efectos aprendidos por segmento demográfico.

## Incertidumbre y riesgo

La banda original de abstención `[L,U]` se transforma en:

```text
[clip(L - d/100, 0, 1), clip(U - d/100, 0, 1)]
```

Se trasladan los extremos originales. No se vuelve a centrar un radio simétrico sobre el
punto recortado, porque eso alteraría el supuesto. La banda de participación invierte los
extremos: `[1 - U_simulada, 1 - L_simulada]`.

Son **bandas condicionales de sensibilidad**, sin nueva garantía de cobertura. No incluyen
incertidumbre sobre el supuesto de intervención. Conservan las limitaciones de la fase 5,
incluido el único bloque intermedio disponible para calibración. El recorte puede estrechar
una banda sin aumentar la confianza que permiten los datos.

Los umbrales de riesgo se fijan a los del pronóstico base, sin recalibración sobre el escenario.
Se recalculan el nivel puntual, los niveles atravesados por la banda y la marca de
clasificación incierta. La API muestra separadamente las categorías base y simulada.

## Agregación territorial

El resumen presenta la media simple de las entidades seleccionadas, conteos por nivel de
riesgo, cambios de nivel y recortes. No es una tasa nacional ponderada por lista nominal.
Una selección de dos entidades también utiliza pesos iguales, aunque difieran en población.
No se combinan las bandas individuales en un intervalo agregado: los errores estatales
comparten dependencia espacial y electoral. `aggregate_prediction_interval` permanece `null`.

## API y validación

### Crear un escenario

`POST /api/v1/simulations`

```json
{
  "name": "Supuesto territorial de participación",
  "target_year": 2027,
  "state_codes": ["01", "17"],
  "participation_change_pp": 3,
  "state_changes": [
    {"state_code": "17", "participation_change_pp": 5}
  ]
}
```

Aplica +3 puntos en Aguascalientes y +5 en Morelos. Para deterioro se utiliza un valor negativo.
Para continuidad se utiliza cero. Omitir `state_codes` selecciona las 32 entidades. Una lista
vacía es inválida. Un conjunto base incompleto impide simular silenciosamente todo el país.

`forecast_run_id` puede fijar una corrida concreta. Si se combina con `target_year`, deben
coincidir. Sin ambos se utiliza el último escenario materializado 2027. No se generan
pronósticos para nuevos años desde el simulador.

El cuerpo rechaza campos desconocidos, cambios duplicados, códigos fuera de `01`–`32`,
cambios por entidad fuera del alcance y magnitudes fuera de `[-100,100]`. No acepta booleanos,
cadenas numéricas, NaN o infinitos como cambio. Los errores de validación devuelven 422,
con ubicación, tipo y mensaje, sin reemitir entradas que no se puedan serializar como JSON.

La respuesta contiene `id`, `created_at` y `result`. Este último incluye `parameters`,
`assumptions`, `forecast`, `summary` y `states`. Cada entidad devuelve ambas tasas, ambas bandas,
riesgo, cambio solicitado, cambio aplicado y marcas de recorte.

### Recuperar y listar

- `GET /api/v1/simulations/{id}`: recupera parámetros y resultados guardados.
- `GET /api/v1/simulations`: lista metadatos paginados, con `limit` (1–100), `offset` y filtro
  opcional `forecast_run_id`. La lista no carga todos los resultados territoriales.

La creación devuelve 201 y cabecera `Location`. Repetir una simulación idéntica devuelve 200
y el mismo registro, sin sobrescribirlo ni duplicarlo. Una simulación inexistente devuelve 404.
Para reproducir una respuesta, puede enviarse su objeto `result.parameters` al POST.

## Persistencia y trazabilidad

La migración `142a4cdf5c9c` añade `simulation_runs`, separada de observaciones y predicciones.
Guarda el resultado completo, el nombre, el pronóstico base y la fecha. La clave foránea
conserva el vínculo con la corrida predictiva. El ID es SHA-256 del resultado canónico, con
parámetros normalizados, tasas base, calibración, versión e implementación del simulador.
La selección territorial y los cambios se ordenan para que el orden de entrada no cambie el ID.

RLS está habilitado en el esquema privado. `ine_api` recibe SELECT e INSERT exclusivamente
en la nueva tabla, sin UPDATE ni DELETE. Conserva lectura sin escritura en las tablas de
predicciones. PUBLIC, `anon` y `authenticated` carecen de acceso a la nueva tabla. El registro
es compartido por los consumidores de esta instancia de backend; no hay separación por
usuario final en esta fase. No se emplean secretos de migración en las peticiones de la API.

## Ejecución y demostración

```powershell
uv run alembic upgrade head
uv run uvicorn app.main:app --host 127.0.0.1 --port 8000
```

En otra terminal:

```powershell
$scenarioBody = @{
  name = 'Supuesto +3 puntos'
  target_year = 2027
  participation_change_pp = 3
} | ConvertTo-Json
$scenarioResult = Invoke-RestMethod 'http://127.0.0.1:8000/api/v1/simulations' -Method Post -ContentType 'application/json' -Body $scenarioBody
Invoke-RestMethod "http://127.0.0.1:8000/api/v1/simulations/$($scenarioResult.id)"
uv run python scripts/report_simulations.py
```

El script registra continuidad y +3 puntos para las 32 entidades, comprueba su recuperación
por GET y exporta `docs/phase6_results.json`, `docs/phase6_results.md` y
`data/samples/simulation_comparison.csv`. Todos sus valores proceden de la API, no de datos
territoriales inventados. Repetirlo con la misma base e implementación conserva los registros.

```powershell
$env:RUN_INTEGRATION='1'
$env:RUN_ML_INTEGRATION='1'
$env:RUN_FORECAST_INTEGRATION='1'
$env:RUN_SIMULATION_INTEGRATION='1'
uv run --group ml pytest -q
uv run --group ml ruff check .
uv run --group ml ruff format --check .
uv run --group ml alembic check
```

Las pruebas cubren conservación de complementos, cero, signos, límites, bandas originalmente
recortadas, sustituciones territoriales, reproducción de parámetros, idempotencia, validación,
consultas, permisos y conservación íntegra de las predicciones de origen.
