"""Divisiones por elección completa: ninguna entidad de la elección de prueba entra a fit."""

import numpy as np

TEST_YEARS = (2018, 2021, 2024)
DEVELOPMENT_YEARS = (2018, 2021)
HOLDOUT_YEAR = 2024


def temporal_folds(examples: list[dict], test_years=TEST_YEARS):
    for example in examples:
        if any(year >= example["year"] for year in example["lineage"]["feature_source_years"]):
            raise ValueError("Fuga temporal en las fuentes de una variable")
    for year in test_years:
        train = [r for r in examples if r["year"] < year]
        test = [r for r in examples if r["year"] == year]
        if not train or not test:
            raise ValueError(f"Corte temporal sin entrenamiento o prueba: {year}")
        yield year, train, test


def metrics(actual, predicted, weights=None) -> dict:
    actual, predicted = np.asarray(actual, dtype=float), np.asarray(predicted, dtype=float)
    if (
        len(actual) == 0
        or actual.shape != predicted.shape
        or not np.isfinite(predicted).all()
        or not np.isfinite(actual).all()
    ):
        raise ValueError("Predicciones no válidas para evaluar")
    error = predicted - actual
    denominator = np.square(actual - actual.mean()).sum()
    return {
        "n": len(actual),
        "mae_pp": float(np.abs(error).mean() * 100),
        "rmse_pp": float(np.sqrt(np.square(error).mean()) * 100),
        "r_squared": float(1 - np.square(error).sum() / denominator) if denominator > 0 else None,
        "bias_pp": float(error.mean() * 100),
        "max_absolute_error_pp": float(np.abs(error).max() * 100),
        "weighted_mae_pp": float(np.average(np.abs(error), weights=weights) * 100)
        if weights is not None
        else None,
    }


def choose_on_development(records: list[dict], model_order: list[str]) -> tuple[str, dict]:
    scores = {}
    for name in model_order:
        rows = [r for r in records if r["model_name"] == name and r["year"] in DEVELOPMENT_YEARS]
        if {r["year"] for r in rows} != set(DEVELOPMENT_YEARS):
            raise ValueError("Faltan periodos de desarrollo para seleccionar")
        scores[name] = metrics(
            [r["actual"] for r in rows],
            [r["predicted"] for r in rows],
            [r["evaluation_weight"] for r in rows],
        )
    winner = min(model_order, key=lambda name: (scores[name]["mae_pp"], model_order.index(name)))
    return winner, scores
