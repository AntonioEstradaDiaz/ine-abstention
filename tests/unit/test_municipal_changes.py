import gzip
import json

from scripts import report_municipal_changes as report

YEARS = (2009, 2012, 2015)


def bundle(tmp_path, municipalities):
    """municipalities: {year: {key: (name, nominal)}}"""
    rows = [{"table": "elections", "row": {"id": i, "year": y}} for i, y in enumerate(YEARS)]
    next_id = 1
    for year, entries in municipalities.items():
        for key, (name, nominal) in entries.items():
            rows.append(
                {
                    "table": "territories",
                    "row": {
                        "id": next_id,
                        "territory_type": "municipality",
                        "reference_year": year,
                        "official_code": key,
                        "state_code": key[:2],
                        "name": name,
                    },
                }
            )
            rows.append(
                {
                    "table": "participation_records",
                    "row": {"territory_id": next_id, "nominal_list": nominal},
                }
            )
            next_id += 1
    with gzip.open(tmp_path / "snapshot.jsonl.gz", "wt", encoding="utf-8") as stream:
        for row in rows:
            stream.write(json.dumps(row) + "\n")
    (tmp_path / "manifest.json").write_text('{"sha256": "abc"}', encoding="utf-8")
    return tmp_path


def test_names_are_compared_without_accents_case_or_punctuation():
    assert report.normalize("Parácuaro") == report.normalize("PARACUARO")
    assert report.normalize("Gral. Bravo") == "GRAL BRAVO"


def test_classifies_new_reappearing_swapped_rekeyed_and_renamed(tmp_path):
    data = {
        2009: {
            "16:065": ("Parácuaro", 10),
            "16:066": ("Paracho", 20),
            "07:117": ("San Andrés Duraznal", 5),
            "07:123": ("Capitán Luis Ángel Vidal", 7),
            "19:020": ("General Bravo", 3),
        },
        2012: {
            "16:065": ("Paracho", 10),
            "16:066": ("Parácuaro", 20),
            "07:119": ("Capitán Luis Ángel Vidal", 7),
            "07:123": ("Mezcalapa", 8),
            "19:020": ("Gral. Bravo", 3),
        },
        2015: {
            "16:065": ("Paracho", 10),
            "16:066": ("Parácuaro", 20),
            "07:117": ("San Andrés Duraznal", 5),
            "07:119": ("Capitán Luis Ángel Vidal", 7),
            "07:123": ("Mezcalapa", 8),
            "19:020": ("Gral. Bravo", 3),
            "02:006": ("San Quintín", 40),
        },
    }
    result = report.diagnose(bundle(tmp_path, data))
    first, second = result["transiciones"]["2009-2012"], result["transiciones"]["2012-2015"]

    assert {c["clave"] for c in first["clave_reasignada"]} == {"16:065", "16:066", "07:123"}
    assert first["municipio_con_clave_nueva"] == [
        {"clave": "07:119", "nombre": "Capitán Luis Ángel Vidal", "clave_anterior": "07:123"}
    ]
    assert [c["clave"] for c in first["cambio_de_nombre"]] == ["19:020"]
    assert [c["clave"] for c in first["claves_ausentes"]] == ["07:117"]

    assert [c["clave"] for c in second["claves_que_reaparecen"]] == ["07:117"]
    assert [c["clave"] for c in second["municipios_nuevos"]] == ["02:006"]
    assert result["claves_con_hueco"] == [
        {"clave": "07:117", "nombre": "San Andrés Duraznal", "anios_sin_dato": [2012]}
    ]

    stable = result["estables"]
    assert stable["municipios"] == 1  # only 19:020: present everywhere, never reassigned
    assert stable["lista_nominal_ultimo_anio"] == 3
    assert stable["lista_nominal_total_ultimo_anio"] == 93
    assert result["por_estado"]["16"] == {"clave_reasignada": 2}
