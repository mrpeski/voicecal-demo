"""When conversation history in SQLiteSession is large, summarize older items so the
next `Runner` call stays under ~60% of a nominal context budget (implicit compaction).
"""

from __future__ import annotations

import json
from typing import Any, cast

import structlog
from agents import SQLiteSession
from agents.items import TResponseInputItem
from openai import AsyncOpenAI

from voicecal.config.settings import settings

log = structlog.get_logger()

_OAI: AsyncOpenAI | None = None


def _client() -> AsyncOpenAI:
    global _OAI
    if _OAI is None:
        _OAI = AsyncOpenAI(api_key=settings.openai_api_key.get_secret_value())
    return _OAI


def _estimate_json_tokens(data: object) -> int:
    # ~4 characters per token for English; good enough for budgeting.
    s = json.dumps(data, default=str, ensure_ascii=False)
    return max(1, len(s) // 4)


def _items_to_brief_text(items: list[dict[str, Any]]) -> str:
    """Flatten stored session items into plain text for the summary model (bounded)."""
    parts: list[str] = []
    for i, it in enumerate(items):
        chunk = json.dumps(it, default=str, ensure_ascii=False)
        if len(chunk) > 3_000:
            chunk = chunk[:3_000] + "…"
        parts.append(f"[{i}]\n{chunk}")
    return "\n\n".join(parts)[:120_000]


def _summary_user_item(summary: str) -> dict[str, Any]:
    return {
        "type": "message",
        "role": "user",
        "content": (
            "[Earlier messages were compacted. Summary of what happened before:]\n\n" + summary
        ),
    }


async def _llm_compact_summary(brief: str) -> str:
    r = await _client().chat.completions.create(
        model=settings.compaction_summary_model,
        temperature=0.2,
        max_tokens=800,
        messages=[
            {
                "role": "system",
                "content": (
                    "You compress prior turns of a voice calendar assistant (VoiceCal). "
                    "Output concise prose: user goals, times/dates, event titles or ids from tool "
                    "results, and anything needed for follow-up. "
                    "If tools listed events, mention titles and start times. "
                    "Stay under 1200 words."
                ),
            },
            {
                "role": "user",
                "content": f"Transcript of prior session items:\n\n{brief}",
            },
        ],
    )
    out = (r.choices[0].message.content or "").strip()
    return out or "Earlier turns discussed the user's schedule; details were compacted."


async def maybe_compact_session(
    session: SQLiteSession,
    next_user_message: str,
) -> None:
    """If history + next user is over the threshold fraction of the budget, compact old items."""
    if not settings.session_compaction_enabled or settings.use_deterministic_llm_echo:
        return
    if not settings.openai_api_key.get_secret_value().strip():
        return

    raw: list[object] = await session.get_items()
    items = cast(list[dict[str, Any]], raw)
    if not items:
        return

    budget = max(8_000, int(settings.compaction_context_budget_tokens))
    threshold = min(0.95, max(0.1, float(settings.compaction_threshold)))
    keep = max(2, int(settings.compaction_keep_last_items))
    next_tok = max(1, len(str(next_user_message or "")) // 4)
    items_tokens = _estimate_json_tokens(items)
    total = items_tokens + next_tok
    if total < budget * threshold:
        return

    # Split: summarize older part, keep recent items verbatim for tool continuity.
    n = len(items)
    if n > keep:
        head, tail = items[:-keep], list(items[-keep:])
    else:
        head, tail = list(items), []

    if not head:
        return
    brief = _items_to_brief_text(head)
    summary = await _llm_compact_summary(brief)
    new_items = [_summary_user_item(summary)] + tail

    before_items = n
    await session.clear_session()
    await session.add_items(cast(list[TResponseInputItem], new_items))
    log.info(
        "session_compacted",
        before_item_count=before_items,
        after_item_count=len(new_items),
        estimated_tokens_before=total,
        budget=budget,
        threshold=threshold,
    )
