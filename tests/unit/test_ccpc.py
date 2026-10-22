"""Casos sintéticos: comprueban reglas, no representan resultados electorales."""

import polars as pl
import pytest

from pipelines.transformation.ccpc import COLUMNS, DataQualityError, aggregate, validate


def fixture_frame(**changes) -> pl.DataFrame:
    row = dict(
        zip(
            COLUMNS,
            (
                "2024",
                "06/02/2024",
                "17",
                "MORELOS",
                "1",
                "Municipio de prueba",
                "1",
                "U",
                "1",
                None,
                "0",
                "18",
                "100",
                "50",
                "30",
                "20",
            ),
            strict=True,
        )
    )
    row.update(changes)
    return pl.DataFrame([row], schema={c: pl.String for c in COLUMNS})


def test_unknown_votes_are_preserved_and_us_date_is_explicit() -> None:
    frame, report = validate(fixture_frame(), 2024)
    totals, demographics = aggregate(frame)
    assert report["totals"] == {"LN": 100, "SV": 50, "NV": 30, "NS": 20}
    assert report["missing_local_district"] == 1
    assert totals.height == 2
    assert totals["state_code"].to_list() == ["17", "17"]
    for dimension in ("sex", "age_band", "section_type"):
        margin = demographics.filter(
            (pl.col("territory_type") == "municipality") & (pl.col("dimension") == dimension)
        )
        assert margin["LN"].sum() == 100
        assert margin["NS"].sum() == 20


@pytest.mark.parametrize(
    "changes",
    [
        {"LN": "99"},
        {"SV": "-1"},
        {"SV": "bad"},
        {"LN": None},
        {"SEXO": "4"},
        {"EDAD": "17"},
        {"EDOCVE": "33"},
        {"FELECCION": "02/06/2024"},
    ],
)
def test_invalid_records_block_load(changes) -> None:
    with pytest.raises(DataQualityError):
        validate(fixture_frame(**changes), 2024)


def test_duplicate_keys_block_instead_of_silent_deduplication() -> None:
    frame = fixture_frame()
    with pytest.raises(DataQualityError, match="duplicate_keys"):
        validate(pl.concat([frame, frame]), 2024)


def test_pre2024_dates_use_day_month_year() -> None:
    _, report = validate(fixture_frame(AELEC="2015", FELECCION="7/6/2015"), 2015)
    assert report["checks"]["wrong_date"] == 0


def test_zero_counts_remain_zero_and_nonbinary_appears_only_in_2024() -> None:
    frame, _ = validate(fixture_frame(SEXO="2", LN="0", SV="0", NV="0", NS="0"), 2024)
    assert aggregate(frame)[0]["LN"].sum() == 0
    with pytest.raises(DataQualityError):
        validate(fixture_frame(AELEC="2021", FELECCION="6/6/2021", SEXO="2"), 2021)
