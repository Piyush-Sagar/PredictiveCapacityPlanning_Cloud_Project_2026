from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg://capplan:capplan@localhost:5432/capplan"
    cognito_issuer: str = "http://localhost:9229/us-east-1_CapPlanDemo"
    cognito_jwks_url: str | None = None  # defaults to {issuer}/.well-known/jwks.json
    cognito_client_id: str = "capplan-web"
    cognito_public_url: str = "http://localhost:9229"
    frontend_url: str = "http://localhost:3000"
    cors_origins: str = "http://localhost:3000"

    sim_tick_seconds: float = 10.0  # wall-clock seconds per simulated 5-minute step
    sim_start: str = "2026-09-28T14:30:00Z"
    scheduler_enabled: bool = True
    auto_bootstrap: bool = True  # run data + backtest at startup if artefacts are missing

    @property
    def jwks_url(self) -> str:
        return self.cognito_jwks_url or f"{self.cognito_issuer}/.well-known/jwks.json"


@lru_cache
def get_settings() -> Settings:
    return Settings()
