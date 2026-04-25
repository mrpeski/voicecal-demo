from pathlib import Path

from pydantic import SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_BACKEND_DIR = Path(__file__).resolve().parents[2]  # backend/


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(_BACKEND_DIR / ".env.local", _BACKEND_DIR / ".env"),
        extra="ignore",
    )
    anthropic_api_key: SecretStr = SecretStr("")
    openai_api_key: SecretStr = SecretStr("")
    google_credentials_path: str = str(_BACKEND_DIR / "token.json")
    user_timezone: str = "Europe/London"
    cors_origins: list[str] = ["http://localhost:5173"]
    mock_providers: bool = True
    # When True, agent.py short-circuits the LLM with a deterministic echo
    # (used by some local dev paths). Defaults to mock_providers if not set.
    mock_llm: bool | None = None

    @field_validator("google_credentials_path")
    @classmethod
    def _resolve_path(cls, v: str) -> str:
        p = Path(v)
        # If the user overrode it via .env with a relative path, anchor it to backend/
        return str(p if p.is_absolute() else _BACKEND_DIR / p)


settings = Settings()

