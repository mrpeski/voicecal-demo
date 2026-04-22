"""Typed tool definitions for the calendar agent using the OpenAI Agents SDK.

The @function_tool decorator derives the schema from type hints + docstring.
"""

from __future__ import annotations

import uuid

from agents import function_tool

from voicecal.errors import NotFoundError

# In-memory calendar – replaced in Phase 2.
_events: dict[str, dict] = {}


@function_tool
async def list_events(time_range_start: str, time_range_end: str) -> list[dict]:
    """List calendar events in a time range. Use this whenever the user asks what is on their calendar.

    Args:
        time_range_start: ISO 8601 datetime, inclusive.
        time_range_end: ISO 8601 datetime, exclusive.
    """
    return sorted(_events.values(), key=lambda e: e["start"])


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


TOOLS = [list_events, create_event, update_event]
