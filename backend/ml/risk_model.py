"""
CARB-Planner — AI Risk Prediction Model
LightGBM classifier for maintenance failure risk scoring.
Outputs risk_probability mapped to LOW/MEDIUM/HIGH/CRITICAL tiers.
Falls back to a deterministic hazard function if training fails.
"""

from __future__ import annotations

import logging
from typing import Dict, Tuple

import numpy as np
import pandas as pd

from backend.ml.training_data import CATEGORICAL_COLS, FEATURE_COLS, create_training_dataframe
from backend.models.task import MaintenanceTask, RiskLevel

logger = logging.getLogger(__name__)


def risk_tier(prob: float) -> RiskLevel:
    """Convert a risk probability to a discrete tier."""
    if prob >= 0.8:
        return RiskLevel.CRITICAL
    elif prob >= 0.6:
        return RiskLevel.HIGH
    elif prob >= 0.35:
        return RiskLevel.MEDIUM
    return RiskLevel.LOW


class RiskPredictor:
    """Predicts failure risk probability for maintenance tasks.

    Uses LightGBM binary classifier trained on synthetic data.
    Falls back to a deterministic engineering hazard function.
    """

    def __init__(self):
        self.model = None
        self.is_ml_model: bool = False
        self.is_trained: bool = False
        self._label_encoders: Dict[str, dict] = {}

    def train(self, seed: int = 42, n_samples: int = 500) -> None:
        """Train risk classifier on synthetic historical data."""
        try:
            import lightgbm as lgb

            df = create_training_dataframe(seed=seed, n_samples=n_samples)

            for col in CATEGORICAL_COLS:
                unique_vals = sorted(df[col].unique())
                mapping = {v: i for i, v in enumerate(unique_vals)}
                self._label_encoders[col] = mapping
                df[col + "_enc"] = df[col].map(mapping)

            feature_cols = FEATURE_COLS + [c + "_enc" for c in CATEGORICAL_COLS]
            X = df[feature_cols].values
            y = df["risk_event"].values

            params = {
                "objective": "binary",
                "metric": "binary_logloss",
                "n_estimators": 100,
                "max_depth": 5,
                "learning_rate": 0.1,
                "num_leaves": 31,
                "verbose": -1,
                "random_state": seed,
            }
            self.model = lgb.LGBMClassifier(**params)
            self.model.fit(X, y)

            self.is_ml_model = True
            self.is_trained = True
            logger.info("LightGBM risk classifier trained successfully")

        except Exception as e:
            logger.warning(f"LightGBM risk training failed ({e}), using fallback risk model")
            self.is_ml_model = False
            self.is_trained = True

    def _prepare_features(self, task: MaintenanceTask) -> np.ndarray:
        """Convert task to feature vector."""
        from backend.data.generator import BASE_DURATIONS
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

    def predict(self, task: MaintenanceTask) -> Tuple[float, RiskLevel]:
        """Predict risk probability and tier for a task.

        Returns:
            (risk_probability, risk_level)
        """
        if not self.is_trained:
            self.train()

        if self.is_ml_model and self.model is not None:
            X = self._prepare_features(task)
            prob = float(self.model.predict_proba(X)[0, 1])
        else:
            prob = self._fallback_predict(task)

        prob = max(0.0, min(1.0, round(prob, 3)))
        level = risk_tier(prob)
        return prob, level

    def _fallback_predict(self, task: MaintenanceTask) -> float:
        """Deterministic hazard function fallback.

        Risk = f(asset_age, condition, defects, days_since_maintenance)
        """
        risk = (
            task.asset_age / 40.0
            + task.defect_count * 0.08
            - task.condition_score * 0.3
            + task.days_since_maintenance / 500.0
        )
        return max(0.0, min(1.0, risk))

    def predict_all(self, tasks: list[MaintenanceTask]) -> list[MaintenanceTask]:
        """Predict risk for all tasks and update their risk fields.

        NOTE: We do NOT override is_deferrable here. Deferability is set by
        the original task definition (criticality). Risk score influences
        the soft objective weights in the optimizer, not hard constraints.
        """
        for task in tasks:
            prob, level = self.predict(task)
            task.risk_score = prob
            task.risk_level = level
        return tasks

    @property
    def model_type(self) -> str:
        return "LightGBM Risk Classifier" if self.is_ml_model else "Fallback risk model"
