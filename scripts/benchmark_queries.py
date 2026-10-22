"""Medir planes reales del rol de API, sin desactivar RLS ni forzar el planificador."""

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from sqlalchemy import text  # noqa: E402

from app.core.config import get_settings  # noqa: E402
from app.core.database import get_engine  # noqa: E402

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=ROOT / "docs/phase7_queries_after.json")
    args = parser.parse_args()
    schema = get_settings().database_schema
    statements = {
        "state_catalog": (
            f'SELECT id,official_code,name FROM "{schema}".territories '
            "WHERE territory_type='state' AND reference_year=2024 "
            "ORDER BY official_code LIMIT 32"
        ),
        "municipality_catalog": (
            f'SELECT id,official_code,name FROM "{schema}".territories '
            "WHERE territory_type='municipality' AND reference_year=2024 "
            "AND state_code='17' ORDER BY official_code LIMIT 100"
        ),
    }
    results = {}
    with get_engine().connect() as conn:
        for name, sql in statements.items():
            plan = conn.execute(
                text("EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) " + sql)
            ).scalar_one()[0]
            results[name] = {"query": sql, "plan": plan}
    args.output.write_text(json.dumps(results, indent=2), encoding="utf-8")
    print(
        json.dumps(
            {
                name: {
                    "execution_ms": data["plan"]["Execution Time"],
                    "rows": data["plan"]["Plan"]["Actual Rows"],
                }
                for name, data in results.items()
            }
        )
    )
