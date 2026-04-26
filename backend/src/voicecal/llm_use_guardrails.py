"""Defence against using the VoiceCal LLM for unrelated tasks: prompt-injection, code
pastes, and long off-topic requests with no calendar/scheduling signal.
"""

from __future__ import annotations

import re

from voicecal.config.settings import settings
from voicecal.core.errors import UsePolicyError

# Obvious system / instruction override and meta-prompts (heuristic; not exhaustive).
_INJECTION_PATTERNS: tuple[re.Pattern[str], ...] = (
    re.compile(
        r"ignore\s+all\s+(the\s+)?(previous|prior|above|earlier)\s+(instructions?|rules?|prompts?)",
        re.IGNORECASE,
    ),
    re.compile(
        r"disregard\s+the\s+(system|prompt|instructions?|rules?|above)\b",
        re.IGNORECASE,
    ),
    re.compile(
        r"(reveal|leak|print|show)\s+(the\s+)?(system|hidden)\s+prompt",
        re.IGNORECASE,
    ),
    re.compile(
        r"\b(jailbreak|DAN\s+mode|developer\s+mode|unconstrained\s+mode)\b",
        re.IGNORECASE,
    ),
    re.compile(
        r"<\|system\|>|<\|im_start\|>system|^\s*system\s*:\s*you\s+are",
        re.IGNORECASE | re.MULTILINE,
    ),
)

# Calendar / scheduling: enough signal that the user is in scope (or a short follow-up).
_RE_CALENDAR_CUE = re.compile(
    r"""(?ix)
    \b(
        calendar|schedul\w*|event\w*|meeting\w*|appointments?|1:1|standup|stand-up|
        book(ing|ed|)?|cancel(ling|ed|)?|reschedul\w*|block\w*|remind\w*|
        lunch|coffee|call|free\s+slot|what'?s\s+on|on\s+my|busy|available|
        today|tomorrow|tonight|yesterday|morning|afternoon|evening|next\s+week|this\s+week|
        monday|tuesday|wednesday|thursday|friday|saturday|sunday|
        \d{1,2}:\d{2}\b|\b\d{1,2}\s*(am|pm)\b|o['’]?clock|
        when\s+(did|do|is|are|can|should)|last\s+time|what\s+do\s+i\s+have|show\s+me|
        move|reschedule|add\s+(a|an|the)\s+|create\s+(a|an|the)\s+event|focus|deep\s+work|
        meet(ing|)?\b|met\s+with|product\s+review|review\s+from
    )\b
    """,
    re.VERBOSE,
)


def _looks_like_code_paste(t: str) -> bool:
    s = t.strip()
    if s.count("```") >= 2:
        return True
    if len(s) > 400 and s.count("```") >= 1 and "\n" in s:
        return True
    lines = [ln for ln in t.splitlines() if ln.strip()]
    if not lines or len(lines) < 3:
        return False
    sig = 0
    for ln in lines[:40]:
        x = ln.strip()
        if (
            x.startswith(("import ", "from ", "def ", "class ", "const ", "function("))
            or re.match(r"^(SELECT|INSERT|UPDATE|DELETE|WITH)\b", x, re.I)
            or re.match(r"^#[!]", x)  # shebang
        ):
            sig += 1
    return sig >= 2


def assert_voicecal_intended_use(text: str) -> None:
    """Ensure the request is in scope for a calendar voice assistant."""
    if not settings.abuse_guards_enabled:
        return

    ref = (text or "").strip()
    if not ref:
        return

    if settings.abuse_injection_guards:
        for p in _INJECTION_PATTERNS:
            if p.search(ref):
                raise UsePolicyError("That request cannot be processed.")

    if settings.abuse_code_paste_guards and _looks_like_code_paste(ref):
        raise UsePolicyError(
            "I only help with calendar and scheduling. Paste code or other technical "
            "content in a development tool instead."
        )

    if not settings.abuse_calendar_relevance:
        return
    if len(ref) <= settings.abuse_short_message_max_chars:
        return
    if _RE_CALENDAR_CUE.search(ref):
        return
    raise UsePolicyError(
        "I can only help with your calendar, meetings, and schedule. "
        "Ask me what's on your calendar, to book or move an event, or to search past events."
    )
