"""HTTP-layer limits: rate per client, and user text / upload size (before the agent)."""

from __future__ import annotations

import asyncio
import time
from collections import deque

from fastapi import Request

from voicecal.config.settings import settings
from voicecal.core.errors import RateLimitError, ValidationError

_HITS: dict[str, deque[float]] = {}
_HITS_LOCK = asyncio.Lock()


def client_id(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()[:256] or "unknown"
    if request.client and request.client.host:
        return str(request.client.host)[:256]
    return "unknown"


def reset_in_memory_rate_limiter_for_tests() -> None:
    _HITS.clear()


async def enforce_request_rate_limit(request: Request) -> None:
    """Reject with 429 when a client has exceeded the sliding-window budget."""
    limit = settings.rate_limit_max_requests
    if limit <= 0:
        return

    key = client_id(request)
    window = float(max(1, settings.rate_limit_window_seconds))
    now = time.monotonic()
    cut = now - window

    async with _HITS_LOCK:
        dq = _HITS.get(key)
        if dq is None:
            dq = deque()
            _HITS[key] = dq
        while dq and dq[0] < cut:
            dq.popleft()
        if len(dq) >= limit:
            raise RateLimitError("Too many requests. Try again shortly.")
        dq.append(now)


def assert_user_text_allows(message: str, *, label: str = "message") -> None:
    """Validate non-empty user text and max length (chat and voice transcript)."""
    if not message or not message.strip():
        raise ValidationError("Message cannot be empty.")
    cap = settings.max_user_message_chars
    if len(message) > cap:
        raise ValidationError(f"{label.capitalize()} exceeds maximum length ({cap} characters).")
