"""Casos sintéticos; no son resultados electorales."""

from copy import deepcopy

import pytest

from app.ml.features import FEATURE_NAMES, build_dataset


def synthetic_snapshot():
    rows, demos = [], []
    for step, year in enumerate((2009, 2012, 2015, 2018, 2021, 2024)):
        for state in range(1, 33):
            code = f"{state:02}"
            sv = 40 + step * 3 + state % 5
            rows.append(
                {
                    "state_code": code,
                    "year": year,
                    "territory_type": "state",
                    "comparability_status": "state_code_stable",
                    "source_id": year,
                    "election_type": "presidential" if step % 2 else "midterm",
                    "nominal_list": 100,
                    "voter_count": sv,
                    "nonvoter_count": 100 - sv,
                    "unspecified_count": 0,
                }
            )
            for dimension, values in (
                ("sex", {"0": 50 - step, "1": 50 + step}),
                ("age_band", {"18-24": 20, "25-34": 20, "35-44": 20, "45-59": 20, "60+": 20}),
                ("section_type", {"U": 100}),
            ):
                for category, count in values.items():
                    demos.append(
                        {
                            "year": year,
                            "state_code": code,
                            "dimension": dimension,
                            "category": category,
                            "nominal_list": count,
                        }
                    )
    return {"observations": rows, "demographics": demos, "sources": []}


def examples():
    snapshot = synthetic_snapshot()
    return build_dataset(snapshot["observations"], snapshot["demographics"])[0]


def test_history_features_have_strict_past_lineage_and_correct_lags():
    snapshot = synthetic_snapshot()
    data, excluded = build_dataset(snapshot["observations"], snapshot["demographics"])
    assert len(data) == 128
    assert len(excluded) == 64
    assert {e["year"] for e in excluded} == {2009, 2012}
    for example in data:
        assert set(example["features"]) == set(FEATURE_NAMES)
        assert max(example["lineage"]["feature_source_years"]) < example["year"]
        assert example["year"] not in example["lineage"]["feature_source_ids"]
    last = next(e for e in data if e["year"] == 2024 and e["state_code"] == "01")
    assert last["lineage"]["previous_same_type_year"] == 2018
    assert last["lineage"]["demographic_reference_year"] == 2021
    assert last["features"]["lag_female_nominal_share"] == 0.54
    assert last["features"]["lag_rural_share"] == 0


def test_current_and_future_labels_and_demographics_cannot_change_features():
    snapshot = synthetic_snapshot()
    original, _ = build_dataset(snapshot["observations"], snapshot["demographics"])
    changed = deepcopy(snapshot)
    for row in changed["observations"]:
        if row["year"] == 2024:
            row.update(voter_count=1, nonvoter_count=99)
    for row in changed["demographics"]:
        if row["year"] == 2024 and row["dimension"] == "sex":
            row["nominal_list"] = 99 if row["category"] == "1" else 1
    modified, _ = build_dataset(changed["observations"], changed["demographics"])
    assert [e["features"] for e in original] == [e["features"] for e in modified]
    assert [e["label"] for e in original if e["year"] < 2024] == [
        e["label"] for e in modified if e["year"] < 2024
    ]


def test_missing_early_trends_stay_missing_until_train_only_imputation():
    first = next(e for e in examples() if e["year"] == 2015)
    assert first["features"]["abstention_trend_pp_per_year"] is None
    assert first["features"]["previous_participation_change_pp"] is None
    assert first["features"]["abstention_volatility_pp"] is None


def test_duplicates_and_nonhomologated_territories_are_rejected():
    snapshot = synthetic_snapshot()
    with pytest.raises(ValueError, match="una observación"):
        build_dataset([*snapshot["observations"], snapshot["observations"][0]], [])
    snapshot["observations"][0]["territory_type"] = "municipality"
    with pytest.raises(ValueError, match="Solo se permiten"):
        build_dataset(snapshot["observations"], [])
