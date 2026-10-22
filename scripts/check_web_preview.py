import json, urllib.request, urllib.error, math

base = "http://127.0.0.1:3000/api/backend/"


def call(path, body=None):
    req = urllib.request.Request(
        base + path,
        data=None if body is None else json.dumps(body).encode(),
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req) as r:
        assert r.headers["X-Pulso-Mode"] == "preview"
        return json.load(r)


p = call("predictions")
assert p["total"] == 32
assert len(call("elections")) == 6
assert call("statistics/summary?year=2021")["items"][0]["territory_count"] == 32
assert len(call("participation/history?state_code=17")["items"]) == 6
assert len(call("models/metrics")["models"]) == 6
for state in ["01", "02", "17", "32"]:
    for shift in [-100, 0, 3, 100]:
        b = {
            "state_codes": [state],
            "participation_change_pp": shift,
            "target_year": 2027,
            "forecast_run_id": p["forecast"]["id"],
        }
        r = call("simulations", b)
        v = r["result"]["states"][0]
        assert r["result"]["assumptions"]["persisted"] is False
        assert (
            0
            <= v["scenario"]["abstention_band_lower"]
            <= v["scenario"]["abstention_rate"]
            <= v["scenario"]["abstention_band_upper"]
            <= 1
        )
        assert math.isclose(
            v["scenario"]["abstention_rate"] + v["scenario"]["participation_rate"], 1
        )
        if shift == 0:
            assert v["baseline"] == v["scenario"]
try:
    call("simulations", {"state_codes": ["99"], "participation_change_pp": 101})
except urllib.error.HTTPError as e:
    assert e.code == 422
else:
    raise AssertionError("Invalid parameters accepted")
print(
    "Preview endpoints passed: 32 states, six elections, metrics, scenario limits and validation."
)
