"""Typed tool definitions for the calendar agent.

Tools delegate to voicecal.calendar for real Google Calendar calls when
settings.mock_providers is False, otherwise use an in-memory dict.
"""

from __future__ import annotations

import uuid

from agents import function_tool

from voicecal import calendar as gcal
from voicecal.errors import NotFoundError
from voicecal.rag import search
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


async def fetch_events(time_range_start: str, time_range_end: str) -> list[dict]:
    """Plain (non-tool) helper: list events in our normalized shape."""
    if settings.mock_providers:
        return sorted(
            (e for e in _events.values() if time_range_start <= e["start"] < time_range_end),
            key=lambda e: e["start"],
        )

    items = await gcal.list_events(time_range_start, time_range_end)
    return [_normalize(ev) for ev in items]


@function_tool
async def list_events(time_range_start: str, time_range_end: str) -> list[dict]:
    """List calendar events in a time range.

    Use this whenever the user asks what is on their calendar.

    Args:
        time_range_start: ISO 8601 datetime, inclusive.
        time_range_end: ISO 8601 datetime, exclusive.
    """
    return await list_events_impl(time_range_start, time_range_end)


async def list_events_impl(time_range_start: str, time_range_end: str) -> list[dict]:
    return await fetch_events(time_range_start, time_range_end)


@function_tool
async def create_event(
    title: str,
    start: str,
    end: str,
    attendees: list[str] | None = None,
    description: str | None = None,
) -> dict:
    """Create a new calendar event. If time is ambiguous, confirm first.

    Args:
        title: Event title.
        start: ISO 8601 datetime in the user's timezone.
        end: ISO 8601 datetime in the user's timezone.
        attendees: Attendee email addresses. Use [] when no attendees are provided.
        description: Optional description. Use "" when no description is provided.
    """
    return await create_event_impl(title, start, end, attendees, description)


async def create_event_impl(
    title: str,
    start: str,
    end: str,
    attendees: list[str] | None = None,
    description: str | None = None,
) -> dict:
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
    """Update an existing event. Call list_events first to get a real event id.

    Args:
        event_id: Event id from list_events — never guess this.
        title: New title, or null to keep unchanged.
        start: New start time, or null to keep unchanged.
        end: New end time, or null to keep unchanged.
        attendees: New attendee list, or null to keep unchanged.
    """
    return await update_event_impl(event_id, title, start, end, attendees)


async def update_event_impl(
    event_id: str,
    title: str | None = None,
    start: str | None = None,
    end: str | None = None,
    attendees: list[str] | None = None,
) -> dict:
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


@function_tool
async def search_calendar_history(query: str, top_k: int = 5) -> list[dict]:
    """Search past calendar events by semantic similarity.

    Use this when the user asks about events whose exact title or time they don't remember —
    e.g. "when did I last meet with Alex?" or "find the budget review from a few months ago".
    Returns up to top_k matching events with title, start time, and attendees.

    Args:
        query: Natural language description of the event to find.
        top_k: Maximum number of results to return (1-10).
    """
    return await search_calendar_history_impl(query, top_k)


async def search_calendar_history_impl(query: str, top_k: int = 5) -> list[dict]:
    return await search(query, top_k=min(max(top_k, 1), 10))


TOOLS = [list_events, create_event, update_event, search_calendar_history]
