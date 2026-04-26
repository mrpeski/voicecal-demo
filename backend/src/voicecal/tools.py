"""Shim. Prefer `voicecal.agent.tools`."""

from voicecal.agent.tools import (
    MOCK_CALENDAR_STORE,
    TOOLS,
    _events,
    create_event,
    create_event_impl,
    fetch_events,
    list_events,
    list_events_impl,
    search_calendar_history,
    search_calendar_history_impl,
    update_event,
    update_event_impl,
)

__all__ = [
    "MOCK_CALENDAR_STORE",
    "TOOLS",
    "_events",
    "create_event",
    "create_event_impl",
    "fetch_events",
    "list_events",
    "list_events_impl",
    "search_calendar_history",
    "search_calendar_history_impl",
    "update_event",
    "update_event_impl",
]
