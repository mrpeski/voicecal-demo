"""Size and shape limits on tool arguments (LLM output) before provider calls."""

from __future__ import annotations

import re
from datetime import UTC, date, datetime, time
from zoneinfo import ZoneInfo

from voicecal.config.settings import settings
from voicecal.core.errors import ToolError


def _parse_list_bound(s: str) -> datetime:
    s = s.strip()
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}$", s):
        d = date.fromisoformat(s)
        u = datetime.combine(
            d,
            time.min,
            tzinfo=ZoneInfo(settings.user_timezone),
        )
        return u.astimezone(UTC)
    t = s
    if t.endswith("Z"):
        t = t.replace("Z", "+00:00", 1)
    d = datetime.fromisoformat(t)
    if d.tzinfo is None:
        d = d.replace(tzinfo=ZoneInfo(settings.user_timezone))
    return d.astimezone(UTC)


def validate_list_range(time_range_start: str, time_range_end: str) -> None:
    """Block absurdly large calendar list windows (abuse and token waste)."""
    if len(time_range_start) > 2_000 or len(time_range_end) > 2_000:
        raise ToolError("List window strings are unreasonably long.")
    try:
        start_utc = _parse_list_bound(time_range_start)
        end_utc = _parse_list_bound(time_range_end)
    except (TypeError, ValueError, OSError) as exc:
        raise ToolError(f"Invalid list window: {exc!s}") from exc
    if end_utc < start_utc:
        raise ToolError("List window: end is before start.")
    span = end_utc - start_utc
    max_d = max(1, settings.max_list_events_range_days)
    if span.total_seconds() > max_d * 24 * 3600:
        raise ToolError(f"List window is too large (max {max_d} days). Use a smaller range.")


def _validate_event_id(event_id: str) -> None:
    if len(event_id) < 1 or len(event_id) > settings.max_event_id_len:
        raise ToolError("Event id is missing or not plausible.")


def _validate_attendee_list(attendees: list[str] | None) -> None:
    if not attendees:
        return
    if len(attendees) > settings.max_event_attendees:
        raise ToolError("Too many attendees.")
    for a in attendees:
        if not isinstance(a, str) or not a.strip() or len(a) > 320:
            raise ToolError("Invalid attendee address.")


def validate_create(
    title: str,
    description: str | None,
    attendees: list[str] | None,
) -> None:
    if not title or not str(title).strip():
        raise ToolError("Event title is required.")
    if len(title) > settings.max_event_title_len:
        raise ToolError("Event title is too long.")
    d = "" if description is None else description
    if len(d) > settings.max_event_description_len:
        raise ToolError("Event description is too long.")
    _validate_attendee_list(attendees)


def validate_update(
    event_id: str,
    title: str | None,
    start: str | None,
    end: str | None,
    attendees: list[str] | None,
) -> None:
    _validate_event_id(event_id)
    if title is not None and len(title) > settings.max_event_title_len:
        raise ToolError("Event title is too long.")
    for s in (start, end):
        if s is not None and len(s) > 2_000:
            raise ToolError("Date/time value is not plausible.")
    _validate_attendee_list(attendees)


def validate_rag_query(query: str) -> None:
    if not query or not str(query).strip():
        raise ToolError("Search query is empty.")
    if len(query) > settings.max_rag_query_chars:
        raise ToolError("Search query is too long.")
