from enum import IntEnum
from typing import Literal

from pydantic import BaseModel

from app.schemas.data import Page

ElectionKind = Literal["presidential", "midterm"]


class ElectionYear(IntEnum):
    Y2009 = 2009
    Y2012 = 2012
    Y2015 = 2015
    Y2018 = 2018
    Y2021 = 2021
    Y2024 = 2024


class Methodology(BaseModel):
    methodology_version: str = "descriptive-v1"
    rate_denominator: str = "SV + NV; NS excluded"
    rate_unit: str = "fraction"
    change_unit: str = "percentage_points"
    historical_comparison: str = "same_election_type"
    missing_data_bounds_interpretation: str = "worst_case_for_NS_not_prediction_intervals"


class CountsRates(BaseModel):
    nominal_list: int
    voter_count: int
    nonvoter_count: int
    unspecified_count: int
    known_participation_count: int
    participation_rate: float | None
    abstention_rate: float | None
    unspecified_rate: float | None
    known_participation_fraction: float | None
    missing_data_abstention_lower: float | None
    missing_data_abstention_upper: float | None


class AnnualStatistics(CountsRates):
    year: int
    election_type: ElectionKind
    source_ids: list[int]
    territory_count: int
    expected_territory_count: int
    previous_comparable_year: int | None
    participation_change_pp: float | None
    abstention_change_pp: float | None
    quality_notes: list[str]


class SummaryResponse(Methodology):
    scope: Literal["national", "state"]
    state_code: str | None
    items: list[AnnualStatistics]


class TrendMetrics(BaseModel):
    observed_elections: int
    valid_elections: int
    years: list[int]
    mean_abstention_rate: float | None
    mean_participation_rate: float | None
    pooled_abstention_rate: float | None
    pooled_participation_rate: float | None
    abstention_sample_std_pp: float | None
    abstention_slope_pp_per_year: float | None
    participation_slope_pp_per_year: float | None
    linear_fit_r_squared: float | None
    direction: str | None
    notes: list[str]


class TrendSeries(BaseModel):
    election_type: ElectionKind
    observations: list[AnnualStatistics]
    metrics: TrendMetrics


class TrendsResponse(Methodology):
    scope: Literal["national", "state"]
    state_code: str | None
    series: list[TrendSeries]


class TerritoryIndicator(CountsRates):
    territory_id: int
    territory_type: Literal["state", "municipality"]
    official_code: str
    state_code: str
    name: str
    year: int
    election_type: ElectionKind
    source_id: int
    comparability_status: str
    history: TrendMetrics | None
    previous_comparable_year: int | None
    participation_change_pp: float | None
    abstention_change_pp: float | None
    gap_vs_national_abstention_pp: float | None
    gap_vs_state_abstention_pp: float | None
    persistent_low_participation: bool | None
    above_national_in_last_three: int | None
    persistence_elections_required: int
    quality_notes: list[str]


class TerritoryStatisticsResponse(Page[TerritoryIndicator], Methodology):
    year: int
    territory_type: str
    sort_by: str


class DemographicIndicator(CountsRates):
    category: str
    territory_count: int


class DemographicResponse(Methodology):
    scope: Literal["national", "state"]
    state_code: str | None
    year: int
    dimension: Literal["sex", "age_band", "section_type"]
    source_ids: list[int]
    notes: list[str]
    items: list[DemographicIndicator]
