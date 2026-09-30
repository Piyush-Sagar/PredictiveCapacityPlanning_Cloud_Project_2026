from .base import Forecast, Forecaster
from .lstm import LSTMQuantile
from .seasonal_naive import SeasonalNaive
from .tsfm_sim import SimulatedTSFM, all_simulated
from .xgboost_q import XGBoostQuantile


def build_all() -> list[Forecaster]:
    return [*all_simulated(), SeasonalNaive(), XGBoostQuantile(), LSTMQuantile()]


__all__ = [
    "Forecast",
    "Forecaster",
    "LSTMQuantile",
    "SeasonalNaive",
    "SimulatedTSFM",
    "XGBoostQuantile",
    "all_simulated",
    "build_all",
]
