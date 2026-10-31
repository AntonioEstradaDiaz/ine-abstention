import csv
import json
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from app.services.forecast_calibration import calibrate, uncertainty_and_risk

root = pathlib.Path(__file__).resolve().parents[1]


def rows(name):
    return list(csv.DictReader((root / "data/samples" / name).open(encoding="utf-8")))


history = []
for r in rows("ccpc_states.csv"):
    y = int(r["year"])
    history.append(
        dict(
            territory_id=int(r["state_code"]),
            territory_type="state",
            official_code=r["state_code"],
            state_code=r["state_code"],
            name=r["name"],
            year=y,
            election_type="midterm" if y % 6 == 5 else "presidential",
            source_id=y,
            nominal_list=int(r["LN"]),
            voter_count=int(r["SV"]),
            nonvoter_count=int(r["NV"]),
            unspecified_count=int(r["NS"]),
            participation_rate=float(r["participation_rate"]),
            abstention_rate=float(r["abstention_rate"]),
            unspecified_rate=float(r["unspecified_rate"]),
            quality_notes=[],
        )
    )
errors = [
    dict(
        year=int(r["year"]),
        state_code=r["state_code"],
        election_type=r["election_type"],
        actual=float(r["actual"]),
        predicted=float(r["predicted"]),
    )
    for r in rows("ccpc_backtest_errors.csv")
    if r["model_name"] == "baseline_last"
]
policy = calibrate(history, errors, "midterm", 2024)
forecast = dict(
    id="preview-export-2027",
    target_year=2027,
    as_of_year=2024,
    election_type="midterm",
    created_at="2026-10-22T00:00:00Z",
    calibration=policy,
    provenance=dict(
        model_name="baseline_last",
        model_run_id="preview-csv",
        production_ready=False,
        mode="preview",
        source_commit="58e090c64ca717c09672e2fa8658926f1a07b7ef",
    ),
)
predictions = []
for r in rows("territorial_predictions.csv"):
    code = r["state_code"]
    h = [x for x in history if x["state_code"] == code and x["election_type"] == "midterm"]
    ref = next(x for x in h if x["year"] == 2021)
    point = float(r["predicted"])
    risk = uncertainty_and_risk(point, policy)
    assert risk["risk_level"] == r["risk_level"] and abs(risk["lower"] - float(r["lower"])) < 1e-10
    prior = next(x for x in h if x["year"] == 2015)
    national_prior = [x for x in history if x["year"] == 2015]
    national_rate = sum(x["nonvoter_count"] for x in national_prior) / sum(
        x["voter_count"] + x["nonvoter_count"] for x in national_prior
    )
    n = len(h)
    mx = sum(x["year"] for x in h) / n
    my = sum(x["abstention_rate"] for x in h) / n
    slope = (
        sum((x["year"] - mx) * (x["abstention_rate"] - my) for x in h)
        / sum((x["year"] - mx) ** 2 for x in h)
        * 100
    )
    predictions.append(
        dict(
            territory_id=int(code),
            state_code=code,
            name=r["name"],
            predicted=point,
            lower=risk["lower"],
            upper=risk["upper"],
            risk_level=risk["risk_level"],
            uncertainty=risk["uncertainty"],
            explanation=dict(
                method="baseline_last",
                causal=False,
                reference_year=2021,
                source_id=2021,
                voter_count=ref["voter_count"],
                nonvoter_count=ref["nonvoter_count"],
                reference_unspecified_rate=ref["unspecified_rate"],
                context_only=dict(
                    historical_mean_abstention=my,
                    abstention_trend_pp_per_year=slope,
                    previous_gap_vs_national_pp=(prior["abstention_rate"] - national_rate) * 100,
                    same_type_history_count=n,
                ),
            ),
            lineage=dict(
                feature_source_years=[x["year"] for x in h], publication_vintage_verified=False
            ),
        )
    )
# Provenance exported from the demo bundle by scripts/export_source_provenance.py.
sources = json.loads((root / "data/samples/ccpc_sources.json").read_text(encoding="utf-8"))
metrics = [
    dict(
        model_name=r["model_name"],
        version="csv-" + r["model_name"],
        status="development_selected" if r["model_name"] == "baseline_last" else "candidate",
        created_at=forecast["created_at"],
        metrics=dict(
            holdout_2024=dict(
                mae_pp=float(r["holdout_2024_mae_pp"]), rmse_pp=float(r["holdout_2024_rmse_pp"])
            ),
            development=dict(mae_pp=float(r["development_mae_pp"])),
        ),
    )
    for r in rows("ccpc_model_comparison.csv")
]
result = dict(
    history=history,
    predictions=dict(total=len(predictions), items=predictions, forecast=forecast),
    sources=dict(
        total=len(sources["sources"]),
        items=[dict(id=d["year"], **d) for d in sources["sources"]],
    ),
    metrics=dict(run_id="preview-csv", selected_on_development="baseline_last", models=metrics),
)
(root / "frontend/src/lib/preview-data.json").write_text(
    json.dumps(result, ensure_ascii=False, allow_nan=False), encoding="utf-8"
)
print(
    "Preview verified: ",
    len(history),
    "historical rows,",
    len(predictions),
    "predictions; calibration matches exported CSV",
)
