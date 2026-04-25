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

    # Google OAuth: prefer env-based credentials so we can deploy to Lambda
    # without mounting a token.json file. The refresh-token flow doesn't need
    # the access token — google-auth refreshes on first use and caches in
    # memory for the life of the process.
    google_client_id: SecretStr = SecretStr("")
    google_client_secret: SecretStr = SecretStr("")
    google_refresh_token: SecretStr = SecretStr("")
    google_token_uri: str = "https://oauth2.googleapis.com/token"
    google_scopes: list[str] = ["https://www.googleapis.com/auth/calendar"]

    # Optional file fallback for local dev — only used if the three env vars
    # above are empty. Lambda deploys leave this unset.
    google_credentials_path: str = str(_BACKEND_DIR / "token.json")

    user_timezone: str = "Europe/London"
    cors_origins: list[str] = ["http://localhost:5173"]
    mock_providers: bool = False
    # Request deterministic LLM echo (dev/tests). See use_deterministic_llm_echo;
    # echo only runs in full mock mode, not with real Google Calendar.
    mock_llm: bool = False

    @field_validator("google_credentials_path")
    @classmethod
    def _resolve_path(cls, v: str) -> str:
        p = Path(v)
        # If the user overrode it via .env with a relative path, anchor it to backend/
        return str(p if p.is_absolute() else _BACKEND_DIR / p)

    @property
    def has_google_env_creds(self) -> bool:
        return bool(
            self.google_client_id.get_secret_value()
            and self.google_client_secret.get_secret_value()
            and self.google_refresh_token.get_secret_value()
        )

    @property
    def use_deterministic_llm_echo(self) -> bool:
        """True only in full mock mode: MOCK_LLM + MOCK_PROVIDERS (in-memory tools)."""
        return self.mock_llm and self.mock_providers

    @property
    def mock_llm_flag_ignored(self) -> bool:
        """MOCK_LLM is on but real providers are used; echo is disabled, real LLM runs."""
        return self.mock_llm and not self.mock_providers


settings = Settings()

