"""Ejecutar dos supuestos demostrativos mediante la API y exportar resultados verificables."""

import argparse
import csv
import json
from pathlib import Path
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]


def post(api: str, payload: dict) -> dict:
    request = Request(
        f"{api}/api/v1/simulations",
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urlopen(request, timeout=30) as response:
        result = json.load(response)
    with urlopen(f"{api}/api/v1/simulations/{result['id']}", timeout=30) as response:
        if json.load(response) != result:
            raise ValueError("La simulación recuperada difiere del resultado guardado")
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--api-url", default="http://127.0.0.1:8000")
    args = parser.parse_args()
    base = post(
        args.api_url.rstrip("/"),
        {
            "name": "Demostración: continuidad",
            "target_year": 2027,
            "participation_change_pp": 0,
        },
    )
    changed = post(
        args.api_url.rstrip("/"),
        {
            "name": "Demostración: +3 pp",
            "forecast_run_id": base["result"]["forecast"]["id"],
            "participation_change_pp": 3,
        },
    )
    report = {"continuity": base, "hypothetical_increase": changed}
    (ROOT / "docs/phase6_results.json").write_text(
        json.dumps(report, indent=2, ensure_ascii=False, allow_nan=False),
        encoding="utf-8",
    )
    with (ROOT / "data/samples/simulation_comparison.csv").open(
        "w", newline="", encoding="utf-8"
    ) as f:
        writer = csv.DictWriter(
            f,
            fieldnames=[
                "state_code",
                "name",
                "base_abstention_rate",
                "scenario_abstention_rate",
                "base_participation_rate",
                "scenario_participation_rate",
                "applied_participation_change_pp",
                "base_risk",
                "scenario_risk",
                "classification_uncertain",
            ],
        )
        writer.writeheader()
        for state in changed["result"]["states"]:
            writer.writerow(
                {
                    "state_code": state["state_code"],
                    "name": state["name"],
                    "base_abstention_rate": state["baseline"]["abstention_rate"],
                    "scenario_abstention_rate": state["scenario"]["abstention_rate"],
                    "base_participation_rate": state["baseline"]["participation_rate"],
                    "scenario_participation_rate": state["scenario"]["participation_rate"],
                    "applied_participation_change_pp": state["applied_participation_change_pp"],
                    "base_risk": state["baseline"]["risk_level"],
                    "scenario_risk": state["scenario"]["risk_level"],
                    "classification_uncertain": state["scenario"]["classification_uncertain"],
                }
            )
    summary = changed["result"]["summary"]
    lines = [
        "# Demostración calculada: fase 6",
        "",
        f"Predicción base: `{base['result']['forecast']['id']}`.",
        f"Continuidad registrada: `{base['id']}`.",
        f"Supuesto +3 puntos registrado: `{changed['id']}`.",
        "",
        "Las cifras son medias simples de las 32 entidades, no tasas nacionales ponderadas.",
        "",
        "| Indicador | Base | Supuesto +3 pp de participación |",
        "|---|---:|---:|",
    ]
    for label, field in (
        ("Participación", "mean_participation_rate"),
        ("Abstención", "mean_abstention_rate"),
    ):
        lines.append(
            f"| {label} | {summary['baseline'][field] * 100:.4f}% | "
            f"{summary['scenario'][field] * 100:.4f}% |"
        )
    for label, level in (
        ("Riesgo bajo", "low"),
        ("Riesgo medio", "medium"),
        ("Riesgo alto", "high"),
    ):
        lines.append(
            f"| {label} | {summary['baseline']['risk_counts'][level]} | "
            f"{summary['scenario']['risk_counts'][level]} |"
        )
    lines.extend(
        [
            "",
            f"Entidades que cambian de nivel puntual: {summary['states_with_risk_change']}.",
            "Clasificaciones inciertas bajo el supuesto: "
            f"{summary['scenario']['uncertain_classifications']}.",
            "",
            "El supuesto es aritmético; no estima la eficacia de una intervención.",
            "Las bandas trasladadas conservan las limitaciones del pronóstico original.",
        ]
    )
    (ROOT / "docs/phase6_results.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(
        json.dumps({"continuity_id": base["id"], "scenario_id": changed["id"], "summary": summary}),
        flush=True,
    )
