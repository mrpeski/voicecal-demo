"""Shim. Prefer `voicecal.providers.calendar`."""

from voicecal.providers.calendar import (
    MOCK_CALENDAR_STORE,
    CalendarProvider,
    GoogleCalendarProvider,
    InMemoryCalendarProvider,
    get_calendar_provider,
)

__all__ = [
    "MOCK_CALENDAR_STORE",
    "CalendarProvider",
    "GoogleCalendarProvider",
    "InMemoryCalendarProvider",
    "get_calendar_provider",
]
