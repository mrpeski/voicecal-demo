"""Build structured objects via OpenAI `chat.completions.parse` (Structured Outputs)."""

from __future__ import annotations

import structlog
from openai import AsyncOpenAI

from voicecal.config.settings import settings
from voicecal.structured.schemas import (
    CalendarChip,
    ClarificationIntent,
    ConflictItem,
    EvalTraceView,
    StructuredDemoBundle,
    SttNormalization,
    WeeklyPlanSection,
)

log = structlog.get_logger()

_OAI: AsyncOpenAI | None = None


def _client() -> AsyncOpenAI:
    global _OAI
    if _OAI is None:
        _OAI = AsyncOpenAI(api_key=settings.openai_api_key.get_secret_value())
    return _OAI


BUNDLE_SYS = """You are extracting UI metadata for a calendar app (VoiceCal) from a single turn.
The JSON must match the schema. Use the user message and the assistant’s reply, plus any tool
summary, to fill fields. If a section is not applicable, use empty lists/defaults.
- calendar_chips: 0–8 time blocks; real ISO-8601 datetimes in the user’s timezone if inferable,
  else your best effort. Never invent past events.
- weekly_plan: planning or reflection; otherwise short defaults.
- conflicts: scheduling conflicts or overload; severity reflects impact.
- clarification: if a follow-up would help, set kind; else "none".
- eval_trace: likely intent, best tool (incl. list_events, create_event, update_event,
  search_calendar_history, none), args preview, policy flags."""


STT_SYS = """You normalize a short voice transcript for a Google Calendar assistant.
Output JSON only. Do not add events; only interpret."""


def demo_structured_fixtures() -> StructuredDemoBundle:
    """Fixed bundle for full mock (deterministic) LLM mode and tests."""
    return StructuredDemoBundle(
        calendar_chips=[
            CalendarChip(
                label="Focus block",
                start_iso="2099-01-01T10:00:00+00:00",
                end_iso="2099-01-01T11:00:00+00:00",
                kind="focus",
                confidence=0.7,
            )
        ],
        weekly_plan=WeeklyPlanSection(
            last_week_read=("(demo) Structured output is on; use the real model for live data."),
            this_week_headline="(demo) Placeholder week summary.",
            goal_alignment=["Ship", "Rest"],
            recommended_actions=[
                "Try a real request with OPENAI_API_KEY and STRUCTURED_OUTPUTS enabled."
            ],
        ),
        conflicts=[
            ConflictItem(
                severity="low",
                reason="(demo) No real conflict",
                affected_event_ids=[],
            )
        ],
        clarification=ClarificationIntent(
            kind="none",
            user_visible_prompt="",
        ),
        eval_trace=EvalTraceView(
            intent="(demo) echo / smoke",
            tool_to_call="none",
            args_preview="{}",
            policy_flags=["mock"],
        ),
    )


async def build_structured_demo_bundle(
    *,
    user_message: str,
    assistant_text: str,
    tool_trace: str,
) -> StructuredDemoBundle | None:
    """Call OpenAI with schema-bound parse; return None on skip / failure."""
    if not settings.structured_outputs_enabled:
        return None
    if not settings.openai_api_key.get_secret_value().strip():
        log.warning("structured_outputs_skipped", reason="no_openai_key")
        return None
    if len((user_message or "").strip()) < 1:
        return None

    user_payload = (
        f"User message:\n{user_message.strip()}\n\n"
        f"Assistant reply (may be long):\n{(assistant_text or '')[:12000]}\n\n"
        f"Tool trace (truncated):\n{tool_trace[:8000]}"
    )
    try:
        c = _client()
        r = await c.chat.completions.parse(
            model=settings.structured_outputs_model,
            messages=[
                {"role": "system", "content": BUNDLE_SYS},
                {"role": "user", "content": user_payload},
            ],
            response_format=StructuredDemoBundle,
            temperature=0.2,
        )
    except Exception:
        log.exception("structured_bundle_failed")
        return None

    parsed = r.choices[0].message.parsed
    if parsed is None:
        log.warning("structured_bundle_no_parsed")
        return None
    return parsed


async def build_stt_structured(transcript: str) -> SttNormalization | None:
    if not settings.structured_outputs_enabled:
        return None
    if not settings.openai_api_key.get_secret_value().strip():
        return None
    t = (transcript or "").strip()
    if not t:
        return None
    if settings.use_deterministic_llm_echo and settings.mock_providers:
        return SttNormalization(
            normalized_intent="(demo) Heard: " + t[:120],
            date_refs_resolved=[],
            duration_minutes=None,
            attendee_names=[],
            needs_clarification=False,
        )
    try:
        c = _client()
        r = await c.chat.completions.parse(
            model=settings.structured_outputs_model,
            messages=[
                {"role": "system", "content": STT_SYS},
                {"role": "user", "content": t},
            ],
            response_format=SttNormalization,
            temperature=0.1,
        )
    except Exception:
        log.exception("stt_structured_failed")
        return None
    p = r.choices[0].message.parsed
    return p
