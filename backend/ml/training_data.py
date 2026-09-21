"""
CARB-Planner — ML Training Data Generator
Creates synthetic historical maintenance data for training LightGBM models.
"""

from __future__ import annotations

import pandas as pd

from backend.data.generator import generate_training_data


def create_training_dataframe(seed: int = 42, n_samples: int = 500) -> pd.DataFrame:
    """Generate a pandas DataFrame of synthetic maintenance records."""
    records = generate_training_data(seed=seed, n_samples=n_samples)
    return pd.DataFrame(records)


FEATURE_COLS = [
    "asset_age",
    "condition_score",
    "crew_size",
    "complexity",
    "weather_factor",
    "defect_count",
    "days_since_maintenance",
    "base_duration",
]

CATEGORICAL_COLS = [
    "task_type",
    "department",
]
