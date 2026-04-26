"""Shim: Google API client. Prefer `voicecal.integrations.google_calendar`."""

from voicecal.integrations.google_calendar import (
    create_event,
    list_events,
    update_event,
)

__all__ = ["create_event", "list_events", "update_event"]
