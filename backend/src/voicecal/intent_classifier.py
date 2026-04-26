"""Small fast LLM classifier: calendar / scheduling in-scope vs other (cost-saving: skipped when
`has_strong_calendar_signal` already matches the user text).
"""

from __future__ import annotations

import json
import re

import structlog
from openai import AsyncOpenAI

from voicecal.config.settings import settings
from voicecal.core.errors import UsePolicyError
from voicecal.llm_use_guardrails import OUT_OF_SCOPE, has_strong_calendar_signal

log = structlog.get_logger()

_client: AsyncOpenAI | None = None

_SYSTEM = """You are a strict intent classifier for VoiceCal (a Google Calendar voice assistant).
Decide if the user message is about: viewing or managing the user's calendar, meetings, events,
availability, rescheduling, or searching when they last met with someone; or a very short
follow-up in that same kind of conversation (e.g. "ok", "yes", "3pm works", "try Tuesday").

Output only a single JSON object, no markdown, no other text. Example: {"in_scope": true}
or {"in_scope": false}"""


def _get_client() -> AsyncOpenAI:
    global _client
    if _client is None:
        _client = AsyncOpenAI(api_key=settings.openai_api_key.get_secret_value())
    return _client


def _parse_in_scope(content: str) -> bool | None:
    t = (content or "").strip()
    if not t:
        return None
    t = t.removeprefix("```json").removesuffix("```").strip()
    try:
        data = json.loads(t)
    except json.JSONDecodeError:
        m = re.search(r'"in_scope"\s*:\s*(true|false)\b', t, re.I)
        if m:
            return m.group(1).lower() == "true"
        m2 = re.search(r"in_scope\s*=\s*(true|false)\b", t, re.I)
        if m2:
            return m2.group(1).lower() == "true"
        return None
    v = data.get("in_scope")
    if isinstance(v, bool):
        return v
    if isinstance(v, str):
        return v.strip().lower() in ("true", "1", "yes", "y")
    return None


async def require_in_scope_by_classifier(user_message: str) -> None:
    """Raise UsePolicyError when the small model classifies the message as out of scope.

    When disabled, when OpenAI is not configured, or when a strong calendar heuristic matches,
    returns without a network call.
    """
    if not settings.intent_classifier_enabled:
        return

    text = str(user_message or "").strip()
    if not text:
        return

    if has_strong_calendar_signal(text):
        return

    if not settings.openai_api_key.get_secret_value().strip():
        log.warning("intent_classifier_skipped", reason="openai_key_missing")
        return

    try:
        r = await _get_client().chat.completions.create(
            model=settings.intent_classifier_model,
            temperature=0,
            max_tokens=32,
            messages=[
                {"role": "system", "content": _SYSTEM},
                {"role": "user", "content": f"User message:\n{text}\n\nJSON only:"},
            ],
        )
    except Exception:
        log.exception("intent_classifier_failed", model=settings.intent_classifier_model)
        return

    raw = (r.choices[0].message.content or "").strip()
    parsed = _parse_in_scope(raw)
    if parsed is None:
        log.warning("intent_classifier_unparseable", content_preview=raw[:200])
        return
    if not parsed:
        raise UsePolicyError(OUT_OF_SCOPE)
