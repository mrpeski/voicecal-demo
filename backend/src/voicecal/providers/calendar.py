"""Pluggable calendar backends: Google (production) vs in-memory (eval, tests).

RAG and `/api/events` use the same Google client in `calendar.py` for real data;
this module is the boundary for *agent tool* event CRUD in normalized form.
"""

from __future__ import annotations

import uuid
from typing import Protocol, runtime_checkable

from voicecal.config.settings import settings
from voicecal.core.errors import NotFoundError
from voicecal.integrations import google_calendar as gcal

# Single in-memory store shared by all InMemoryCalendarProvider instances.
# Eval seeds this dict; tests clear it.
MOCK_CALENDAR_STORE: dict[str, dict] = {}


def _normalize_gcal_event(ev: dict) -> dict:
    """Map Google API event → flat shape used by tools and the UI."""
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


@runtime_checkable
class CalendarProvider(Protocol):
    """Calendar contract for agent tools (normalized events only)."""

    async def list_events(
        self,
        time_range_start: str,
        time_range_end: str,
    ) -> list[dict]:
        """ISO window; start inclusive, end exclusive. Sorted by start."""

    async def create_event(
        self,
        title: str,
        start: str,
        end: str,
        attendees: list[str] | None,
        description: str | None,
    ) -> dict:
        ...

    async def update_event(
        self,
        event_id: str,
        title: str | None,
        start: str | None,
        end: str | None,
        attendees: list[str] | None,
    ) -> dict:
        ...


class GoogleCalendarProvider:
    """Production: Google Calendar API (see `voicecal.integrations.google_calendar`)."""

    async def list_events(
        self, time_range_start: str, time_range_end: str
    ) -> list[dict]:
        items = await gcal.list_events(time_range_start, time_range_end)
        return [_normalize_gcal_event(ev) for ev in items]

    async def create_event(
        self,
        title: str,
        start: str,
        end: str,
        attendees: list[str] | None,
        description: str | None,
    ) -> dict:
        created = await gcal.create_event(title, start, end, attendees, description)
        return _normalize_gcal_event(created)

    async def update_event(
        self,
        event_id: str,
        title: str | None,
        start: str | None,
        end: str | None,
        attendees: list[str] | None,
    ) -> dict:
        changes: dict = {}
        if title is not None:
            changes["title"] = title
        if start is not None:
            changes["start"] = start
        if end is not None:
            changes["end"] = end
        if attendees is not None:
            changes["attendees"] = attendees
        raw = await gcal.update_event(event_id, changes)
        return _normalize_gcal_event(raw)


class InMemoryCalendarProvider:
    """Deterministic, fast, no network — used when `MOCK_PROVIDERS=true`."""

    def __init__(self) -> None:
        self._data = MOCK_CALENDAR_STORE

    async def list_events(
        self, time_range_start: str, time_range_end: str
    ) -> list[dict]:
        return sorted(
            (e for e in self._data.values() if time_range_start <= e["start"] < time_range_end),
            key=lambda e: e["start"],
        )

    async def create_event(
        self,
        title: str,
        start: str,
        end: str,
        attendees: list[str] | None,
        description: str | None,
    ) -> dict:
        event_id = str(uuid.uuid4())
        ev = {
            "id": event_id,
            "title": title,
            "start": start,
            "end": end,
            "attendees": attendees or [],
            "description": description,
        }
        self._data[event_id] = ev
        return ev

    async def update_event(
        self,
        event_id: str,
        title: str | None,
        start: str | None,
        end: str | None,
        attendees: list[str] | None,
    ) -> dict:
        if event_id not in self._data:
            raise NotFoundError(f"Event {event_id} not found")
        ev = self._data[event_id]
        if title is not None:
            ev["title"] = title
        if start is not None:
            ev["start"] = start
        if end is not None:
            ev["end"] = end
        if attendees is not None:
            ev["attendees"] = attendees
        return ev


def get_calendar_provider() -> CalendarProvider:
    """Select backend from settings (no long-lived cache — eval toggles mock at runtime)."""
    if settings.mock_providers:
        return InMemoryCalendarProvider()
    return GoogleCalendarProvider()
