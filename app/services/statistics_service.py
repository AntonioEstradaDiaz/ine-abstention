"""Estadística descriptiva; no produce pronósticos ni efectos causales."""

from collections import defaultdict
from collections.abc import Iterable
from math import isclose
from statistics import fmean, stdev

COUNTS = ("nominal_list", "voter_count", "nonvoter_count", "unspecified_count")
PERSISTENCE_ELECTIONS = 3


class StatisticsNotFound(Exception):
    pass


class StatisticsConflict(Exception):
    pass


def rates(counts: dict) -> dict:
    """NS no es abstención. Los límites representan solo información faltante."""
    nominal = counts["nominal_list"]
    known = counts["voter_count"] + counts["nonvoter_count"]
    return {
        **{key: counts[key] for key in COUNTS},
        "known_participation_count": known,
        "participation_rate": counts["voter_count"] / known if known else None,
        "abstention_rate": counts["nonvoter_count"] / known if known else None,
        "unspecified_rate": counts["unspecified_count"] / nominal if nominal else None,
        "known_participation_fraction": known / nominal if nominal else None,
        "missing_data_abstention_lower": counts["nonvoter_count"] / nominal if nominal else None,
        "missing_data_abstention_upper": (
            (counts["nonvoter_count"] + counts["unspecified_count"]) / nominal if nominal else None
        ),
    }


def pooled(rows: Iterable[dict]) -> dict:
    total = dict.fromkeys(COUNTS, 0)
    for row in rows:
        for key in COUNTS:
            total[key] += row[key]
    return rates(total)


def change_pp(current: float | None, previous: float | None) -> float | None:
    return (current - previous) * 100 if current is not None and previous is not None else None


def history_metrics(points: list[dict]) -> dict:
    valid = [point for point in points if point["abstention_rate"] is not None]
    values = [point["abstention_rate"] for point in valid]
    slope, fit, direction = None, None, None
    if len(valid) >= 3:
        years = [point["year"] for point in valid]
        mean_x, mean_y = fmean(years), fmean(values)
        variance_x = sum((year - mean_x) ** 2 for year in years)
        if variance_x:
            slope_rate = (
                sum((p["year"] - mean_x) * (p["abstention_rate"] - mean_y) for p in valid)
                / variance_x
            )
            slope = slope_rate * 100
            direction = (
                "flat"
                if isclose(slope, 0, abs_tol=1e-12)
                else ("increasing_abstention" if slope > 0 else "decreasing_abstention")
            )
            total_variation = sum((value - mean_y) ** 2 for value in values)
            if total_variation > 1e-24:
                residual = sum(
                    (p["abstention_rate"] - (mean_y + slope_rate * (p["year"] - mean_x))) ** 2
                    for p in valid
                )
                fit = max(0.0, min(1.0, 1 - residual / total_variation))
    return {
        "observed_elections": len(points),
        "valid_elections": len(valid),
        "years": [p["year"] for p in valid],
        "mean_abstention_rate": fmean(values) if values else None,
        "mean_participation_rate": 1 - fmean(values) if values else None,
        "pooled_abstention_rate": pooled(valid)["abstention_rate"] if valid else None,
        "pooled_participation_rate": pooled(valid)["participation_rate"] if valid else None,
        "abstention_sample_std_pp": stdev(values) * 100 if len(values) >= 2 else None,
        "abstention_slope_pp_per_year": slope,
        "participation_slope_pp_per_year": -slope if slope is not None else None,
        "linear_fit_r_squared": fit,
        "direction": direction,
        "notes": ["descriptive_only", "few_elections_no_significance_claim"]
        + (["insufficient_points_for_trend"] if len(valid) < 3 else []),
    }


def checked_states(rows: list[dict]) -> list[dict]:
    keys = [(row["year"], row["state_code"]) for row in rows]
    if len(keys) != len(set(keys)):
        raise StatisticsConflict(
            "Más de una versión de fuente por entidad y año; revisar la selección"
        )
    return rows


def annual_series(rows: list[dict], expected_territories: int) -> list[dict]:
    groups = defaultdict(list)
    for row in rows:
        groups[row["year"]].append(row)
    points, previous = [], {}
    for year, group in sorted(groups.items()):
        kinds = {row["election_type"] for row in group}
        if len(kinds) != 1:
            raise StatisticsConflict("Tipo electoral inconsistente dentro del mismo año")
        kind = kinds.pop()
        point = {
            "year": year,
            "election_type": kind,
            **pooled(group),
            "source_ids": sorted({r["source_id"] for r in group}),
            "territory_count": len(group),
            "expected_territory_count": expected_territories,
            "previous_comparable_year": previous[kind]["year"] if kind in previous else None,
            "participation_change_pp": None,
            "abstention_change_pp": None,
            "quality_notes": [],
        }
        if kind in previous:
            for metric in ("participation", "abstention"):
                point[f"{metric}_change_pp"] = change_pp(
                    point[f"{metric}_rate"], previous[kind][f"{metric}_rate"]
                )
        if len(group) != expected_territories:
            point["quality_notes"].append("incomplete_territorial_coverage")
        if point["unspecified_count"]:
            point["quality_notes"].append("unspecified_participation_present")
        if point["abstention_rate"] is None:
            point["quality_notes"].append("no_known_participation")
        points.append(point)
        previous[kind] = point
    return points


def summary(rows: list[dict], *, year: int | None = None, state_code: str | None = None) -> dict:
    checked_states(rows)
    selected = [row for row in rows if state_code is None or row["state_code"] == state_code]
    points = annual_series(selected, 1 if state_code else 32)
    if year is not None:
        points = [point for point in points if point["year"] == year]
    if not points:
        raise StatisticsNotFound("No hay observaciones para los filtros solicitados")
    return {
        "scope": "state" if state_code else "national",
        "state_code": state_code,
        "items": points,
    }


def trends(
    rows: list[dict],
    *,
    state_code: str | None = None,
    election_type: str | None = None,
    through_year: int | None = None,
) -> dict:
    checked_states(rows)
    selected = [
        row
        for row in rows
        if (state_code is None or row["state_code"] == state_code)
        and (through_year is None or row["year"] <= through_year)
    ]
    groups = defaultdict(list)
    for point in annual_series(selected, 1 if state_code else 32):
        if election_type is None or point["election_type"] == election_type:
            groups[point["election_type"]].append(point)
    if not groups:
        raise StatisticsNotFound("No hay elecciones comparables para los filtros solicitados")
    return {
        "scope": "state" if state_code else "national",
        "state_code": state_code,
        "series": [
            {"election_type": kind, "observations": points, "metrics": history_metrics(points)}
            for kind, points in sorted(groups.items())
        ],
    }


def territory_indicators(states: list[dict], snapshots: list[dict], *, year: int) -> list[dict]:
    checked_states(states)
    national = {p["year"]: p for p in annual_series(states, 32)}
    national_current = national.get(year)
    if national_current is None:
        raise StatisticsNotFound("No hay referencia nacional para ese año")
    histories = defaultdict(list)
    state_current = {}
    for row in sorted(states, key=lambda r: r["year"]):
        histories[row["state_code"]].append(row)
        if row["year"] == year:
            state_current[row["state_code"]] = rates(row)
    result = []
    for row in snapshots:
        current = rates(row)
        history, previous, persistent, count_above = None, None, None, None
        notes = []
        if national_current["territory_count"] != 32:
            notes.append("incomplete_national_reference_coverage")
        if national_current["unspecified_count"]:
            notes.append("national_reference_has_unspecified_participation")
        if current["unspecified_count"] and "unspecified_participation_present" not in notes:
            notes.append("unspecified_participation_present")
        if current["abstention_rate"] is None:
            notes.append("no_known_participation")
        if row["territory_type"] == "state":
            points = [
                {**r, **rates(r)}
                for r in histories[row["state_code"]]
                if r["year"] <= year and r["election_type"] == row["election_type"]
            ]
            history = history_metrics(points)
            previous = points[-2] if len(points) >= 2 else None
            recent = points[-PERSISTENCE_ELECTIONS:]
            pairs = [(p["abstention_rate"], national[p["year"]]["abstention_rate"]) for p in recent]
            if (
                len(pairs) == PERSISTENCE_ELECTIONS
                and all(a is not None and b is not None for a, b in pairs)
                and all(national[p["year"]]["territory_count"] == 32 for p in recent)
            ):
                count_above = sum(a > b for a, b in pairs)
                persistent = count_above == PERSISTENCE_ELECTIONS
        else:
            notes.append("municipal_history_requires_crosswalk")
        result.append(
            {
                **{
                    key: row[key]
                    for key in (
                        "territory_id",
                        "territory_type",
                        "official_code",
                        "state_code",
                        "name",
                        "year",
                        "election_type",
                        "source_id",
                        "comparability_status",
                    )
                },
                **current,
                "history": history,
                "previous_comparable_year": previous["year"] if previous else None,
                "participation_change_pp": change_pp(
                    current["participation_rate"], previous["participation_rate"]
                )
                if previous
                else None,
                "abstention_change_pp": change_pp(
                    current["abstention_rate"], previous["abstention_rate"]
                )
                if previous
                else None,
                "gap_vs_national_abstention_pp": change_pp(
                    current["abstention_rate"], national_current["abstention_rate"]
                ),
                "gap_vs_state_abstention_pp": change_pp(
                    current["abstention_rate"], state_current[row["state_code"]]["abstention_rate"]
                )
                if row["territory_type"] == "municipality"
                else None,
                "persistent_low_participation": persistent,
                "above_national_in_last_three": count_above,
                "persistence_elections_required": PERSISTENCE_ELECTIONS,
                "quality_notes": sorted(set(notes)),
            }
        )
    return result
