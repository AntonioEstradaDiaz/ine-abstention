"""Generar análisis descriptivo reproducible usando exclusivamente las observaciones de Supabase."""

import csv
import json
import sys
from datetime import UTC, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
KIND_NAMES = {"midterm": "Intermedias", "presidential": "Presidenciales"}

from sqlalchemy.orm import Session  # noqa: E402

from app.core.database import get_engine  # noqa: E402
from app.repositories.statistics import demographic_counts, observations  # noqa: E402
from app.schemas.statistics import (  # noqa: E402
    DemographicIndicator,
    Methodology,
    SummaryResponse,
    TerritoryIndicator,
    TrendsResponse,
)
from app.services.statistics_service import rates, summary, territory_indicators, trends  # noqa: E402


def pct(value):
    return f"{value * 100:.2f}%" if value is not None else "Sin datos"


def number(value):
    return f"{value:+.2f}" if value is not None else "Sin comparación"


def generate() -> None:
    with Session(get_engine()) as db:
        rows = observations(db)
        national = SummaryResponse(**summary(rows)).model_dump()
        national_trends = TrendsResponse(**trends(rows)).model_dump()
        by_year = {}
        for year in sorted({row["year"] for row in rows}):
            snapshots = [row for row in rows if row["year"] == year]
            by_year[year] = [
                TerritoryIndicator(**item).model_dump()
                for item in territory_indicators(rows, snapshots, year=year)
            ]
        latest = max(by_year)
        demographic = {}
        for dimension in ("sex", "age_band", "section_type"):
            demographic[dimension] = [
                DemographicIndicator(**{**row, **rates(row)}).model_dump()
                for row in demographic_counts(db, year=latest, dimension=dimension)
            ]
    output = {
        "generated_at": datetime.now(UTC).isoformat(),
        "methodology": Methodology().model_dump(),
        "national_summary": national,
        "national_trends": national_trends,
        "state_indicators_by_year": by_year,
        "latest_demographics": {"year": latest, "dimensions": demographic},
    }
    (ROOT / "docs/phase3_statistics.json").write_text(
        json.dumps(output, ensure_ascii=False, indent=2, allow_nan=False), encoding="utf-8"
    )
    fields = [
        "official_code",
        "name",
        "year",
        "election_type",
        "nominal_list",
        "voter_count",
        "nonvoter_count",
        "unspecified_count",
        "participation_rate",
        "abstention_rate",
        "unspecified_rate",
        "participation_change_pp",
        "gap_vs_national_abstention_pp",
        "persistent_low_participation",
        "source_id",
        "history_valid_elections",
        "mean_abstention_rate",
        "abstention_sample_std_pp",
        "abstention_slope_pp_per_year",
        "participation_slope_pp_per_year",
        "linear_fit_r_squared",
    ]
    with (ROOT / "data/samples/ccpc_state_statistics.csv").open(
        "w", newline="", encoding="utf-8"
    ) as f:
        writer = csv.DictWriter(f, fieldnames=fields)
        writer.writeheader()
        for indicators in by_year.values():
            for item in indicators:
                history = item["history"]
                flat = {
                    **item,
                    **{
                        key: history[key]
                        for key in (
                            "mean_abstention_rate",
                            "abstention_sample_std_pp",
                            "abstention_slope_pp_per_year",
                            "participation_slope_pp_per_year",
                            "linear_fit_r_squared",
                        )
                    },
                    "history_valid_elections": history["valid_elections"],
                }
                writer.writerow({key: "" if flat[key] is None else flat[key] for key in fields})
    lines = [
        "# Resultados descriptivos de participación y abstención",
        "",
        "Datos observados CCPC 2009–2024. No son predicciones ni estimaciones causales.",
        "Los porcentajes usan SV + NV. NS se presenta aparte. "
        "Los cambios comparan el mismo tipo de elección.",
        "",
        "## Resumen nacional",
        "",
        "| Año | Tipo | Participación | Abstención | NS / LN | "
        "Cambio de participación (pp) | Comparación |",
        "| --- | --- | ---: | ---: | ---: | ---: | --- |",
    ]
    for point in national["items"]:
        lines.append(
            f"| {point['year']} | {KIND_NAMES[point['election_type']]} | "
            f"{pct(point['participation_rate'])} | "
            f"{pct(point['abstention_rate'])} | {pct(point['unspecified_rate'])} | "
            f"{number(point['participation_change_pp'])} | "
            f"{point['previous_comparable_year'] or 'Sin anterior'} |"
        )
    lines += ["", "## Tendencias nacionales por tipo de elección", ""]
    for series in national_trends["series"]:
        m = series["metrics"]
        lines += [
            f"### {KIND_NAMES[series['election_type']]}",
            "",
            f"Años: {', '.join(map(str, m['years']))}. "
            f"Media de abstención por elección: {pct(m['mean_abstention_rate'])}.",
            "Pendiente de participación: "
            f"{number(m['participation_slope_pp_per_year'])} pp por año.",
            f"Desviación estándar muestral de abstención: {m['abstention_sample_std_pp']:.2f} pp.",
            "Solo tres elecciones: la recta describe la serie; "
            "no establece significancia ni predice una elección futura.",
            "",
        ]
        last_year = m["years"][-1]
        items = by_year[last_year]
        ordered = sorted(items, key=lambda item: -item["abstention_rate"])
        lines += [
            f"Estados con mayor abstención observada en {last_year}:",
            "",
            "| Estado | Abstención | Brecha frente al agregado nacional (pp) | NS / LN |",
            "| --- | ---: | ---: | ---: |",
        ]
        for item in ordered[:5]:
            lines.append(
                f"| {item['name']} | {pct(item['abstention_rate'])} | "
                f"{number(item['gap_vs_national_abstention_pp'])} | "
                f"{pct(item['unspecified_rate'])} |"
            )
        persistent = [
            item["name"] for item in items if item["persistent_low_participation"] is True
        ]
        lines += [
            "",
            "Estados con participación por debajo del agregado nacional "
            "en las tres elecciones comparables: "
            + (", ".join(persistent) if persistent else "Ninguno")
            + ".",
            "",
        ]
    current = national["items"][-1]
    lines += [
        "## Cobertura y límites",
        "",
        f"En {latest}, NS representa {pct(current['unspecified_rate'])} de la lista nominal.",
        "Si todos los registros NS hubieran votado o se hubieran abstenido, "
        "el rango aritmético de abstención sobre LN sería "
        f"{pct(current['missing_data_abstention_lower'])}–"
        f"{pct(current['missing_data_abstention_upper'])}.",
        "Ese rango solo describe información faltante; "
        "no es un intervalo de predicción ni de confianza.",
        "Los municipios tienen estadísticas de cada año y brechas frente a su estado y al país. "
        "No se han unido como una serie histórica homologada.",
        "Las diferencias de cobertura y los cambios de NS "
        "pueden afectar la comparación entre elecciones.",
        "",
        "## Reproducibilidad",
        "",
        "Generar con `uv run python scripts/report_statistics.py`. "
        "Fórmulas y contratos en `docs/phase3.md`.",
        "El JSON conserva todos los indicadores estatales por año y los identificadores de fuente; "
        "el CSV incluye 192 observaciones estatales.",
        "",
    ]
    (ROOT / "docs/phase3_results.md").write_text("\n".join(lines), encoding="utf-8")
    print(
        json.dumps(
            {
                "years": sorted(by_year),
                "state_records": sum(len(v) for v in by_year.values()),
                "latest_year": latest,
                "latest_participation": current["participation_rate"],
                "participation_change_pp": current["participation_change_pp"],
            }
        ),
        flush=True,
    )


if __name__ == "__main__":
    generate()
