"""
CARB-Planner — AI Duration Prediction Model
LightGBM quantile regression for P50 and P90 maintenance duration prediction.
Falls back to a deterministic statistical model if LightGBM training fails.

The optimizer uses P90 (conservative) duration rather than only the average,
ensuring robustness against schedule overruns.
"""

from __future__ import annotations

import logging
from typing import Dict, Optional, Tuple

import numpy as np
import pandas as pd

from backend.data.generator import BASE_DURATIONS
from backend.ml.training_data import CATEGORICAL_COLS, FEATURE_COLS, create_training_dataframe
from backend.models.task import MaintenanceTask, TaskType

logger = logging.getLogger(__name__)


class DurationPredictor:
    """Predicts maintenance task duration at P50 and P90 confidence levels.

    Uses LightGBM quantile regression trained on synthetic historical data.
    Falls back to a deterministic lookup table if training fails.
    """

    def __init__(self):
        self.model_p50 = None
        self.model_p90 = None
        self.is_ml_model: bool = False
        self.is_trained: bool = False
        self._label_encoders: Dict[str, dict] = {}

    def train(self, seed: int = 42, n_samples: int = 500) -> None:
        """Train quantile regression models on synthetic data."""
        try:
            import lightgbm as lgb

            df = create_training_dataframe(seed=seed, n_samples=n_samples)

            # Encode categoricals
            for col in CATEGORICAL_COLS:
                unique_vals = sorted(df[col].unique())
                mapping = {v: i for i, v in enumerate(unique_vals)}
                self._label_encoders[col] = mapping
                df[col + "_enc"] = df[col].map(mapping)

            feature_cols = FEATURE_COLS + [c + "_enc" for c in CATEGORICAL_COLS]
            X = df[feature_cols].values
            y = df["actual_duration"].values

            # P50 quantile regression
            params_p50 = {
                "objective": "quantile",
                "alpha": 0.50,
                "metric": "quantile",
                "n_estimators": 100,
                "max_depth": 5,
                "learning_rate": 0.1,
                "num_leaves": 31,
                "verbose": -1,
                "random_state": seed,
            }
            self.model_p50 = lgb.LGBMRegressor(**params_p50)
            self.model_p50.fit(X, y)

            # P90 quantile regression (conservative estimate)
            params_p90 = {
                "objective": "quantile",
                "alpha": 0.90,
                "metric": "quantile",
                "n_estimators": 100,
                "max_depth": 5,
                "learning_rate": 0.1,
                "num_leaves": 31,
                "verbose": -1,
                "random_state": seed,
            }
            self.model_p90 = lgb.LGBMRegressor(**params_p90)
            self.model_p90.fit(X, y)

            self.is_ml_model = True
            self.is_trained = True
            logger.info("LightGBM duration prediction models trained successfully (P50 & P90)")

        except Exception as e:
            logger.warning(f"LightGBM training failed ({e}), using fallback duration model")
            self.is_ml_model = False
            self.is_trained = True

    def _prepare_features(self, task: MaintenanceTask) -> np.ndarray:
        """Convert a maintenance task to a feature vector for prediction."""
        base_dur = BASE_DURATIONS.get(task.task_type, 120)
        task_type_enc = self._label_encoders.get("task_type", {}).get(task.task_type.value, 0)
        dept_enc = self._label_encoders.get("department", {}).get(task.department.value, 0)

        features = [
            task.asset_age,
            task.condition_score,
            task.crew_size,
            task.complexity,
            task.weather_factor,
            task.defect_count,
            task.days_since_maintenance,
            base_dur,
            task_type_enc,
            dept_enc,
        ]
        return np.array([features])

    def predict(self, task: MaintenanceTask) -> Tuple[int, int]:
        """Predict P50 and P90 duration for a maintenance task.

        Returns:
            (p50_minutes, p90_minutes) rounded to nearest 15 minutes.
        """
        if not self.is_trained:
            self.train()

        if self.is_ml_model and self.model_p50 is not None and self.model_p90 is not None:
            X = self._prepare_features(task)
            p50 = max(30, int(self.model_p50.predict(X)[0]))
            p90 = max(p50, int(self.model_p90.predict(X)[0]))
        else:
            p50, p90 = self._fallback_predict(task)

        # Round to nearest 15 minutes
        p50 = max(15, ((p50 + 14) // 15) * 15)
        p90 = max(p50, ((p90 + 14) // 15) * 15)

        return p50, p90

    def _fallback_predict(self, task: MaintenanceTask) -> Tuple[int, int]:
        """Deterministic fallback duration prediction.

        Labeled as: Fallback duration model
        """
        base = BASE_DURATIONS.get(task.task_type, 120)
        # Adjust for condition and complexity
        adjusted = base * (1.0 + (1.0 - task.condition_score) * 0.3 + task.complexity * 0.15)
        p50 = int(adjusted)
        p90 = int(adjusted * 1.25)  # 25% buffer for P90
        return max(30, p50), max(p50, p90)

    def predict_all(self, tasks: list[MaintenanceTask]) -> list[MaintenanceTask]:
        """Predict durations for all tasks and update their predicted fields."""
        for task in tasks:
            p50, p90 = self.predict(task)
            task.predicted_p50_min = p50
            task.predicted_p90_min = p90
        return tasks

    @property
    def model_type(self) -> str:
        return "LightGBM Quantile Regression" if self.is_ml_model else "Fallback duration model"
