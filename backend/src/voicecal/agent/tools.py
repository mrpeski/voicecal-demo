"""Typed tool definitions for the calendar agent.

Tools delegate to `get_calendar_provider()` (Google or in-memory) — see
`calendar_provider.py`.
"""

from __future__ import annotations

from agents import function_tool

from voicecal.agent import tool_bounds
from voicecal.providers.calendar import MOCK_CALENDAR_STORE, get_calendar_provider
from voicecal.rag import search

# Backwards compat: eval/tests reached into the mock dict.
_events: dict[str, dict] = MOCK_CALENDAR_STORE


async def fetch_events(time_range_start: str, time_range_end: str) -> list[dict]:
    """Plain (non-tool) helper: list events in our normalized shape."""
    backend = get_calendar_provider()
    return await backend.list_events(time_range_start, time_range_end)


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
    tool_bounds.validate_list_range(time_range_start, time_range_end)
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
    tool_bounds.validate_create(title, description, attendees)
    backend = get_calendar_provider()
    return await backend.create_event(title, start, end, attendees, description)


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
    tool_bounds.validate_update(event_id, title, start, end, attendees)
    backend = get_calendar_provider()
    return await backend.update_event(event_id, title, start, end, attendees)


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
    tool_bounds.validate_rag_query(query)
    return await search(query, top_k=min(max(top_k, 1), 10))


TOOLS = [list_events, create_event, update_event, search_calendar_history]
