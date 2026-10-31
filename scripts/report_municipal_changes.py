"""Diagnóstico de homologación municipal entre elecciones (punto 3, sin cambiar la app).

Lee los municipios del paquete de demo (`data/demo/snapshot.jsonl.gz`, restaurable con
`scripts/ci_fixtures.py restore`) y escribe `docs/punto3_diagnostico_municipal.json`.
Usa solo claves INE (`EDOCVE:MPIOCVE`) y nombres; no confirma decretos de creación ni geometrías.
"""

import argparse
import gzip
import json
import re
import unicodedata
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def normalize(name: str) -> str:
    """Compare names ignoring accents, case and punctuation."""
    text = unicodedata.normalize("NFD", name)
    text = "".join(c for c in text if unicodedata.category(c) != "Mn").upper()
    return re.sub(r"\s+", " ", re.sub(r"[^A-Z0-9 ]", " ", text)).strip()


def read_bundle(bundle: Path) -> tuple[dict, dict, dict]:
    """Municipalities by year ({key: name}), nominal list by territory id, and year by id."""
    with gzip.open(bundle / "snapshot.jsonl.gz", "rt", encoding="utf-8") as stream:
        rows = [json.loads(line) for line in stream if line.strip()]
    years = {r["row"]["id"]: r["row"]["year"] for r in rows if r["table"] == "elections"}
    municipalities: dict[int, dict[str, dict]] = defaultdict(dict)
    for r in rows:
        t = r["row"]
        if r["table"] == "territories" and t["territory_type"] == "municipality":
            municipalities[t["reference_year"]][t["official_code"]] = t
    nominal = {
        r["row"]["territory_id"]: r["row"]["nominal_list"]
        for r in rows
        if r["table"] == "participation_records"
    }
    return dict(municipalities), nominal, years


def transition(before: dict[str, dict], after: dict[str, dict], seen: set[str]) -> dict:
    """Changes between two elections. A key is reassigned when its old name now belongs to
    another key of the same state (or its new name belonged to another key before). `seen`
    holds every key observed in earlier elections, to tell new keys from keys that reappear."""
    by_name = lambda side: {(t["state_code"], normalize(t["name"])): k for k, t in side.items()}  # noqa: E731
    names_before, names_after = by_name(before), by_name(after)
    renamed, reassigned = [], []
    for key in sorted(before.keys() & after.keys()):
        old, new = before[key], after[key]
        if normalize(old["name"]) == normalize(new["name"]):
            continue
        change = {"clave": key, "antes": old["name"], "despues": new["name"]}
        moved = names_after.get((old["state_code"], normalize(old["name"])), key) != key
        moved |= names_before.get((new["state_code"], normalize(new["name"])), key) != key
        (reassigned if moved else renamed).append(change)
    entry = lambda side, key: {"clave": key, "nombre": side[key]["name"]}  # noqa: E731
    added = sorted(after.keys() - before.keys())
    rekeyed = {
        k: names_before[(after[k]["state_code"], normalize(after[k]["name"]))]
        for k in added
        if (after[k]["state_code"], normalize(after[k]["name"])) in names_before
    }
    return {
        "municipios_antes": len(before),
        "municipios_despues": len(after),
        "misma_clave": len(before.keys() & after.keys()),
        "municipios_nuevos": [entry(after, k) for k in added if k not in seen and k not in rekeyed],
        "claves_que_reaparecen": [entry(after, k) for k in added if k in seen],
        "municipio_con_clave_nueva": [
            {**entry(after, k), "clave_anterior": rekeyed[k]}
            for k in added
            if k not in seen and k in rekeyed
        ],
        "claves_ausentes": [entry(before, k) for k in sorted(before.keys() - after.keys())],
        "clave_reasignada": reassigned,
        "cambio_de_nombre": renamed,
    }


def diagnose(bundle: Path) -> dict:
    municipalities, nominal, _ = read_bundle(bundle)
    years = sorted(municipalities)
    transitions, seen = {}, set()
    for a, b in zip(years, years[1:], strict=False):
        seen |= municipalities[a].keys()
        transitions[f"{a}-{b}"] = transition(municipalities[a], municipalities[b], seen)
    involved = {c["clave"] for t in transitions.values() for c in t["clave_reasignada"]}
    everywhere = set.intersection(*(set(municipalities[y]) for y in years))
    stable = sorted(everywhere - involved)
    gaps = sorted(
        k
        for k in set().union(*(municipalities[y] for y in years))
        if (present := [y for y in years if k in municipalities[y]])
        and len(present) < len(years)
        and any(y not in present for y in years if present[0] < y < present[-1])
    )
    last = years[-1]
    total = sum(nominal.get(t["id"], 0) for t in municipalities[last].values())
    in_stable = sum(nominal.get(municipalities[last][k]["id"], 0) for k in stable)
    states: dict[str, dict] = defaultdict(lambda: defaultdict(int))
    for t in transitions.values():
        for kind in ("municipios_nuevos", "municipio_con_clave_nueva", "clave_reasignada"):
            for c in t[kind]:
                states[c["clave"][:2]][kind] += 1
    for k in gaps:
        states[k[:2]]["claves_con_hueco"] += 1
    manifest = json.loads((bundle / "manifest.json").read_text(encoding="utf-8"))
    return {
        "fuente": {
            "paquete": "data/demo/snapshot.jsonl.gz",
            "sha256": manifest.get("sha256"),
            "metodo": "Claves INE EDOCVE:MPIOCVE y nombres sin acentos ni puntuación",
        },
        "anios": years,
        "municipios_por_anio": {str(y): len(municipalities[y]) for y in years},
        "transiciones": transitions,
        "claves_con_hueco": [
            {
                "clave": k,
                "nombre": next(m[k]["name"] for m in municipalities.values() if k in m),
                "anios_sin_dato": [y for y in years if k not in municipalities[y]],
            }
            for k in gaps
        ],
        "estables": {
            "criterio": "Clave presente en las seis elecciones y nunca reasignada",
            "municipios": len(stable),
            "de_total_ultimo_anio": len(municipalities[last]),
            "lista_nominal_ultimo_anio": in_stable,
            "lista_nominal_total_ultimo_anio": total,
            "proporcion_lista_nominal": round(in_stable / total, 4) if total else None,
        },
        "por_estado": {s: dict(v) for s, v in sorted(states.items())},
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--bundle", type=Path, default=ROOT / "data/demo")
    parser.add_argument(
        "--output", type=Path, default=ROOT / "docs/punto3_diagnostico_municipal.json"
    )
    args = parser.parse_args()
    report = diagnose(args.bundle)
    args.output.write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n"
    )
    print(json.dumps({"municipios_por_anio": report["municipios_por_anio"], **report["estables"]}))
