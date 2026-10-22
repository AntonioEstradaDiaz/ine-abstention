"""Variables estatales retrospectivas. Nunca consumir el proceso objetivo como entrada."""

from collections import defaultdict
from math import log1p
from statistics import fmean, stdev

FEATURE_VERSION = "state-history-v1"
NUMERIC_FEATURES = [
    "previous_abstention_rate",
    "historical_mean_abstention",
    "abstention_trend_pp_per_year",
    "abstention_volatility_pp",
    "previous_participation_change_pp",
    "same_type_history_count",
    "all_history_count",
    "years_since_previous_same_type",
    "last_abstention_rate_all_types",
    "previous_unspecified_rate",
    "last_unspecified_rate",
    "last_nominal_log1p",
    "previous_gap_vs_national_pp",
    "prior_above_national_fraction",
    "lag_female_nominal_share",
    "lag_age_18_24_share",
    "lag_age_25_34_share",
    "lag_age_35_44_share",
    "lag_age_45_59_share",
    "lag_age_60_plus_share",
    "lag_urban_share",
    "lag_mixed_share",
    "lag_rural_share",
]
CATEGORICAL_FEATURES = ["state_code", "election_type"]
FEATURE_NAMES = NUMERIC_FEATURES + CATEGORICAL_FEATURES


class FeatureUnavailable(ValueError):
    pass


def abstention(row: dict) -> float | None:
    known = row["voter_count"] + row["nonvoter_count"]
    return row["nonvoter_count"] / known if known else None


def unspecified(row: dict) -> float | None:
    return row["unspecified_count"] / row["nominal_list"] if row["nominal_list"] else None


def demographic_index(rows: list[dict]) -> dict:
    index = defaultdict(dict)
    for row in rows:
        key = (row["year"], row["state_code"], row["dimension"])
        if row["category"] in index[key]:
            raise ValueError("Desglose demográfico duplicado")
        index[key][row["category"]] = row["nominal_list"]
    return dict(index)


def lag_share(last: dict, demo: dict, dimension: str, category: str) -> float | None:
    values = demo.get((last["year"], last["state_code"], dimension))
    if values is None or last["nominal_list"] == 0:
        return None
    if sum(values.values()) != last["nominal_list"]:
        raise ValueError("El margen demográfico no reconcilia con su propia elección histórica")
    # Una categoría ausente dentro de un margen completo tiene conteo cero.
    return values.get(category, 0) / last["nominal_list"]


def build_features(state: str, target_year: int, kind: str, rows: list[dict], demo: dict) -> dict:
    past = [row for row in rows if row["year"] < target_year]
    history = sorted((row for row in past if row["state_code"] == state), key=lambda r: r["year"])
    same = [row for row in history if row["election_type"] == kind and abstention(row) is not None]
    if not same:
        raise FeatureUnavailable("Sin elección previa comparable")
    last, previous = history[-1], same[-1]
    values = [abstention(row) for row in same]
    mean_x, mean_y = fmean(row["year"] for row in same), fmean(values)
    trend = None
    if len(same) >= 2:
        trend = (
            100
            * sum((r["year"] - mean_x) * (abstention(r) - mean_y) for r in same)
            / sum((r["year"] - mean_x) ** 2 for r in same)
        )
    by_year = defaultdict(list)
    for row in past:
        by_year[row["year"]].append(row)
    national = {}
    for year, group in by_year.items():
        known = sum(r["voter_count"] + r["nonvoter_count"] for r in group)
        if len(group) == 32 and known:
            national[year] = sum(r["nonvoter_count"] for r in group) / known
    comparable = [r for r in same if r["year"] in national]
    previous_reference = national.get(previous["year"])
    features = {
        "previous_abstention_rate": values[-1],
        "historical_mean_abstention": fmean(values),
        "abstention_trend_pp_per_year": trend,
        "abstention_volatility_pp": stdev(values) * 100 if len(values) >= 2 else None,
        "previous_participation_change_pp": (values[-2] - values[-1]) * 100
        if len(values) >= 2
        else None,
        "same_type_history_count": len(same),
        "all_history_count": len(history),
        "years_since_previous_same_type": target_year - previous["year"],
        "last_abstention_rate_all_types": abstention(last),
        "previous_unspecified_rate": unspecified(previous),
        "last_unspecified_rate": unspecified(last),
        "last_nominal_log1p": log1p(last["nominal_list"]),
        "previous_gap_vs_national_pp": (values[-1] - previous_reference) * 100
        if previous_reference is not None
        else None,
        "prior_above_national_fraction": fmean(
            abstention(r) > national[r["year"]] for r in comparable
        )
        if comparable
        else None,
        "state_code": state,
        "election_type": kind,
    }
    for name, dimension, category in (
        ("lag_female_nominal_share", "sex", "1"),
        ("lag_age_18_24_share", "age_band", "18-24"),
        ("lag_age_25_34_share", "age_band", "25-34"),
        ("lag_age_35_44_share", "age_band", "35-44"),
        ("lag_age_45_59_share", "age_band", "45-59"),
        ("lag_age_60_plus_share", "age_band", "60+"),
        ("lag_urban_share", "section_type", "U"),
        ("lag_mixed_share", "section_type", "M"),
        ("lag_rural_share", "section_type", "R"),
    ):
        features[name] = lag_share(last, demo, dimension, category)
    return {
        "features": features,
        "lineage": {
            "target_year": target_year,
            "feature_source_years": sorted({r["year"] for r in history}),
            "feature_source_ids": sorted({r["source_id"] for r in past}),
            "previous_same_type_year": previous["year"],
            "demographic_reference_year": last["year"],
            "publication_vintage_verified": False,
        },
    }


def build_dataset(rows: list[dict], demographics: list[dict]) -> tuple[list[dict], list[dict]]:
    if any(
        row["territory_type"] != "state" or row["comparability_status"] != "state_code_stable"
        for row in rows
    ):
        raise ValueError("Solo se permiten entidades con continuidad de código verificada")
    keys = [(row["year"], row["state_code"]) for row in rows]
    if len(keys) != len(set(keys)):
        raise ValueError("Más de una observación por entidad y elección")
    demo = demographic_index(demographics)
    examples, excluded = [], []
    for row in sorted(rows, key=lambda r: (r["year"], r["state_code"])):
        key = {"year": row["year"], "state_code": row["state_code"]}
        label = abstention(row)
        try:
            if label is None:
                raise FeatureUnavailable("Participación objetivo no observada")
            prepared = build_features(
                row["state_code"], row["year"], row["election_type"], rows, demo
            )
            examples.append(
                {
                    **key,
                    "election_type": row["election_type"],
                    "label": label,
                    "label_source_id": row["source_id"],
                    "label_unspecified_rate": unspecified(row),
                    "evaluation_weight": row["voter_count"] + row["nonvoter_count"],
                    **prepared,
                }
            )
        except FeatureUnavailable as exc:
            excluded.append({**key, "reason": str(exc)})
    return examples, excluded
