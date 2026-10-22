"""Candidatos y parámetros fijados antes de observar sus errores temporales."""

import numpy as np
from lightgbm import LGBMRegressor
from sklearn.base import BaseEstimator, RegressorMixin
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestRegressor
from sklearn.impute import SimpleImputer
from sklearn.linear_model import Ridge
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from xgboost import XGBRegressor

from app.ml.features import FEATURE_NAMES, NUMERIC_FEATURES

SEED = 42
MODEL_SPECS = {
    "baseline_last": {"feature": "previous_abstention_rate"},
    "baseline_mean": {"feature": "historical_mean_abstention"},
    "ridge": {"alpha": 10.0, "solver": "svd"},
    "random_forest": {
        "n_estimators": 300,
        "max_depth": 4,
        "min_samples_leaf": 5,
        "max_features": 0.8,
        "random_state": SEED,
        "n_jobs": 1,
    },
    "xgboost": {
        "n_estimators": 150,
        "max_depth": 2,
        "learning_rate": 0.05,
        "min_child_weight": 5,
        "reg_lambda": 10.0,
        "subsample": 1.0,
        "colsample_bytree": 1.0,
        "objective": "reg:squarederror",
        "tree_method": "hist",
        "device": "cpu",
        "random_state": SEED,
        "n_jobs": 1,
    },
    "lightgbm": {
        "n_estimators": 150,
        "max_depth": 3,
        "num_leaves": 7,
        "min_child_samples": 10,
        "learning_rate": 0.05,
        "reg_lambda": 10.0,
        "deterministic": True,
        "force_col_wise": True,
        "random_state": SEED,
        "n_jobs": 1,
        "verbosity": -1,
    },
}


def matrix(examples: list[dict]) -> np.ndarray:
    return np.asarray(
        [
            [
                r["features"][name] if r["features"][name] is not None else np.nan
                for name in FEATURE_NAMES
            ]
            for r in examples
        ],
        dtype=object,
    )


class HistoricalBaseline(RegressorMixin, BaseEstimator):
    def __init__(self, feature="previous_abstention_rate"):
        self.feature = feature

    def fit(self, X, y=None):
        self.n_features_in_ = X.shape[1]
        return self

    def predict(self, X):
        return np.asarray(X[:, FEATURE_NAMES.index(self.feature)], dtype=float)


def build_model(name: str):
    parameters = MODEL_SPECS[name]
    if name.startswith("baseline_"):
        return HistoricalBaseline(**parameters)
    estimator = {
        "ridge": Ridge,
        "random_forest": RandomForestRegressor,
        "xgboost": XGBRegressor,
        "lightgbm": LGBMRegressor,
    }[name](**parameters)
    numerical = [
        ("impute", SimpleImputer(strategy="median", add_indicator=True, keep_empty_features=True))
    ]
    if name == "ridge":
        numerical.append(("scale", StandardScaler()))
    preprocess = ColumnTransformer(
        [
            ("numeric", Pipeline(numerical), list(range(len(NUMERIC_FEATURES)))),
            (
                "categories",
                OneHotEncoder(handle_unknown="ignore", sparse_output=False),
                list(range(len(NUMERIC_FEATURES), len(FEATURE_NAMES))),
            ),
        ]
    )
    return Pipeline([("preprocess", preprocess), ("regressor", estimator)])
