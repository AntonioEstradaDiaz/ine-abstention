from datetime import date, datetime

from pydantic import BaseModel, ConfigDict


class Page[T](BaseModel):
    total: int
    limit: int
    offset: int
    items: list[T]


class DataSourceRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    institution: str
    dataset_name: str
    year: int
    source_url: str
    landing_url: str
    retrieved_at: datetime
    checksum: str
    byte_size: int
    license_notes: str
    published_at: datetime | None = None
    validation_status: str | None = None
    pipeline_version: str | None = None


class ElectionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    year: int
    election_date: date
    election_type: str


class HistoryRead(BaseModel):
    territory_id: int
    territory_type: str
    official_code: str
    name: str
    year: int
    election_type: str
    comparability_status: str
    nominal_list: int
    voter_count: int
    nonvoter_count: int
    unspecified_count: int
    participation_rate: float | None
    abstention_rate: float | None
    unspecified_rate: float | None
    source_id: int


class HistoryPage(Page[HistoryRead]):
    rates_denominator: str = "SV + NV; NS excluded"
