"""Publicar inventario verificable y una muestra de agregados estatales reales."""

import json
from pathlib import Path

import polars as pl

ROOT = Path(__file__).resolve().parents[1]

if __name__ == "__main__":
    catalog = json.loads((ROOT / "pipelines/ingestion/sources.json").read_text(encoding="utf-8"))
    datasets, states = [], []
    for source in catalog["datasets"]:
        year = source["year"]
        inventory = json.loads(
            (ROOT / f"data/raw/ccpc/{year}/inventory.json").read_text(encoding="utf-8")
        )
        quality = json.loads(
            (ROOT / f"data/processed/ccpc/{year}/quality.json").read_text(encoding="utf-8")
        )
        datasets.append(
            {
                **source,
                "sha256": inventory["sha256"],
                "retrieved_at": inventory["retrieved_at"],
                "compressed_bytes": inventory["bytes"],
                "uncompressed_bytes": sum(m["size"] for m in inventory["members"]),
                "raw_rows": quality["raw_rows"],
                "territories": quality["territories"],
                "demographic_rows": quality["demographic_rows"],
                "totals": quality["totals"],
                "members": [{"name": m["name"], "bytes": m["size"]} for m in inventory["members"]],
                "missing_local_district": sum(
                    f["missing_local_district"] for f in quality["files"]
                ),
                "age_min": min(f["age_min"] for f in quality["files"]),
                "age_max": max(f["age_max"] for f in quality["files"]),
                "quality_status": quality["status"],
            }
        )
        frame = pl.read_parquet(ROOT / f"data/processed/ccpc/{year}/territories.parquet")
        states.append(
            frame.filter(pl.col("territory_type") == "state").with_columns(
                pl.lit(year).alias("year"),
                (pl.col("SV") / (pl.col("SV") + pl.col("NV"))).alias("participation_rate"),
                (pl.col("NV") / (pl.col("SV") + pl.col("NV"))).alias("abstention_rate"),
                (pl.col("NS") / pl.col("LN")).alias("unspecified_rate"),
            )
        )
    report = {"landing_url": catalog["landing_url"], "datasets": datasets}
    (ROOT / "docs/data_inventory.json").write_text(
        json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    pl.concat(states).sort("year", "state_code").write_csv(ROOT / "data/samples/ccpc_states.csv")
    print(
        json.dumps(
            {
                "raw_rows": sum(d["raw_rows"] for d in datasets),
                "territorial_records": sum(d["territories"] for d in datasets),
                "demographic_records": sum(d["demographic_rows"] for d in datasets),
                "csv_files": sum(
                    sum(m["name"].endswith(".csv") for m in d["members"]) for d in datasets
                ),
            }
        )
    )
