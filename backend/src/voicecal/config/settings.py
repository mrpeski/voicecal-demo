from pathlib import Path

from pydantic import SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_BACKEND_DIR = Path(__file__).resolve().parents[3]  # backend/


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

    # --- API guardrails (abuse + cost) ---
    # User text: chat and post-STT voice transcript.
    max_user_message_chars: int = 12_000
    max_voice_audio_bytes: int = 4 * 1024 * 1024  # 4 MiB

    # In-memory rate limit: max requests per IP (or x-forwarded-for) per window.
    # 0 = disabled.
    rate_limit_max_requests: int = 30
    rate_limit_window_seconds: int = 60

    # Agent loop: hard cap on tool+model turns (SDK uses this for each run).
    max_agent_turns: int = 6

    # Tool sandbox: calendar list range, RAG query, and event string sizes.
    max_list_events_range_days: int = 800  # allow ~2+ years, block huge scans
    max_rag_query_chars: int = 2_000
    max_event_title_len: int = 500
    max_event_description_len: int = 20_000
    max_event_attendees: int = 100
    max_event_id_len: int = 500

    # --- LLM abuse / off-topic use (single-purpose: calendar assistant) ---
    # When true, user text is checked for obvious prompt-injection, code dumps,
    # and long off-topic text with no calendar/scheduling signal. Eval harness
    # sets this to False for golden runs. 0 = skip relevance check for "short" turns.
    abuse_guards_enabled: bool = True
    abuse_injection_guards: bool = True
    abuse_code_paste_guards: bool = True
    # Obvious general-knowledge / homework / translation (checked at any length).
    abuse_off_topic_guards: bool = True
    abuse_calendar_relevance: bool = True
    # Shorter or equal: allow without a calendar signal (e.g. "ok", "yes, 3pm is fine" may be short;
    # longer: must match something calendar-related).
    abuse_short_message_max_chars: int = 120

    # Main agent + auxiliary LLM calls (classifier, compaction, structured parse).
    agent_model: str = "gpt-5.4-mini"

    # Optional: small fast LLM over user text when heuristics did not find a strong calendar signal.
    intent_classifier_enabled: bool = True
    intent_classifier_model: str = "gpt-5.4-mini"

    # --- Implicit session compaction (OpenAI Agents SQLiteSession) ---
    # When estimated input (history JSON + next user) exceeds
    # `compaction_context_budget_tokens * compaction_threshold`, older history is
    # summarized and replaced with a single user message + last N raw items.
    session_compaction_enabled: bool = True
    compaction_context_budget_tokens: int = 100_000
    compaction_threshold: float = 0.6
    compaction_keep_last_items: int = 8
    compaction_summary_model: str = "gpt-5.4-mini"

    # --- Clerk (optional). When True, all /api/* except /health require
    # Authorization: Bearer <Clerk session JWT>. Get issuer + JWKS from the Clerk dashboard.
    # Leave disabled for local dev/tests without a Clerk app.
    clerk_enabled: bool = False
    # Example: https://my-app.clerk.accounts.com (JWT `iss` claim, no trailing path)
    clerk_issuer: str = ""
    # Example: https://my-app.clerk.accounts.com/.well-known/jwks.json
    clerk_jwks_url: str = ""

    # --- Structured outputs (OpenAI parse) — one extra call after each agent turn ---
    structured_outputs_enabled: bool = True
    structured_outputs_model: str = "gpt-5.4-mini"


settings = Settings()
