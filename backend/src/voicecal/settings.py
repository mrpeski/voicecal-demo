from pathlib import Path

from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

_HERE = Path(__file__).parent.parent.parent  # src/voicecal/ -> backend/


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(_HERE / ".env.local", _HERE / ".env"),
        extra="ignore",
    )

    anthropic_api_key: SecretStr = SecretStr("")
    openai_api_key: SecretStr = SecretStr("")
    google_credentials_path: str = "token.json"
    user_timezone: str = "Europe/London"
    cors_origins: list[str] = ["http://localhost:5173"]
    mock_providers: bool = True


settings = Settings()
