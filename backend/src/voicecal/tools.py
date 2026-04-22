"""Typed tool definitions for the calendar agent.

Tools delegate to voicecal.calendar for real Google Calendar calls when
settings.mock_providers is False, otherwise use an in-memory dict.
"""

from __future__ import annotations

import uuid

from agents import function_tool

from voicecal import calendar as gcal
from voicecal.errors import NotFoundError
from voicecal.settings import settings

# In-memory calendar used only when settings.mock_providers is True.
_events: dict[str, dict] = {}


def _normalize(ev: dict) -> dict:
    """Convert a Google Calendar event dict to our flat shape."""
    start = ev.get("start", {})
    end = ev.get("end", {})
    return {
        "id": ev["id"],
        "title": ev.get("summary", "Untitled"),
        "start": start.get("dateTime") or start.get("date", ""),
        "end": end.get("dateTime") or end.get("date", ""),
        "attendees": [a["email"] for a in ev.get("attendees", []) if "email" in a],
        "description": ev.get("description"),
    }


@function_tool
async def list_events(time_range_start: str, time_range_end: str) -> list[dict]:
    """List calendar events in a time range. Use this whenever the user asks what is on their calendar.

    Args:
        time_range_start: ISO 8601 datetime, inclusive.
        time_range_end: ISO 8601 datetime, exclusive.
    """
    if settings.mock_providers:
        return sorted(_events.values(), key=lambda e: e["start"])

    items = await gcal.list_events(time_range_start, time_range_end)
    return [_normalize(ev) for ev in items]


@function_tool
async def create_event(
    title: str,
    start: str,
    end: str,
    attendees: list[str] | None = None,
    description: str | None = None,
) -> dict:
    """Create a new calendar event. If the time is ambiguous, confirm with the user first.

    Args:
        title: Event title.
        start: ISO 8601 datetime in the user's timezone.
        end: ISO 8601 datetime in the user's timezone.
        attendees: Attendee email addresses.
        description: Optional description.
    """
    if settings.mock_providers:
        event_id = str(uuid.uuid4())
        ev = {
            "id": event_id,
            "title": title,
            "start": start,
            "end": end,
            "attendees": attendees or [],
            "description": description,
        }
        _events[event_id] = ev
        return ev

    created = await gcal.create_event(title, start, end, attendees, description)
    return _normalize(created)


@function_tool
async def update_event(
    event_id: str,
    title: str | None = None,
    start: str | None = None,
    end: str | None = None,
    attendees: list[str] | None = None,
) -> dict:
    """Update an existing event. Always call list_events first to get a real event id.

    Args:
        event_id: Event id from list_events — never guess this.
        title: New title.
        start: New start time.
        end: New end time.
        attendees: New attendee list.
    """
    if settings.mock_providers:
        if event_id not in _events:
            raise NotFoundError(f"Event {event_id} not found")
        ev = _events[event_id]
        if title is not None:
            ev["title"] = title
        if start is not None:
            ev["start"] = start
        if end is not None:
            ev["end"] = end
        if attendees is not None:
            ev["attendees"] = attendees
        return ev

    updated = await gcal.update_event(event_id, title, start, end, attendees)
    return _normalize(updated)


TOOLS = [list_events, create_event, update_event]
