"""Google Calendar client. All sync calls wrapped in asyncio.to_thread."""

from __future__ import annotations

import asyncio
from functools import lru_cache
from pathlib import Path

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

from voicecal.settings import settings


def _load_file_credentials(path: Path) -> Credentials:
    if not path.exists():
        raise RuntimeError(f"Google token file not found at {path}.")

    creds = Credentials.from_authorized_user_file(str(path))
    if not creds.valid:
        if creds.expired and creds.refresh_token:
            creds.refresh(Request())
            path.write_text(creds.to_json())
        else:
            raise RuntimeError(f"Token at {path} is invalid and cannot refresh. Re-run OAuth flow.")
    return creds


@lru_cache(maxsize=1)
def _get_service():
    """Load creds, refresh if expired, build the service. Cached per process.

    Two paths:
    1. Env-based (production / Lambda): GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET
       + GOOGLE_REFRESH_TOKEN. We construct Credentials directly and rely on
       google-auth to refresh the access token on first use.
    2. File fallback (local dev): token.json from the OAuth installed-app flow.
       Only used when the three env vars aren't all set.
    """
    path = Path(settings.google_credentials_path)
    if settings.has_google_env_creds:
        try:
            creds = Credentials(
                token=None,
                refresh_token=settings.google_refresh_token.get_secret_value(),
                client_id=settings.google_client_id.get_secret_value(),
                client_secret=settings.google_client_secret.get_secret_value(),
                token_uri=settings.google_token_uri,
                scopes=settings.google_scopes,
            )
            # Mint access token now so auth issues are surfaced immediately.
            creds.refresh(Request())
        except Exception as exc:
            if path.exists():
                creds = _load_file_credentials(path)
            else:
                raise RuntimeError(
                    "Env Google credentials failed to refresh and no token file fallback "
                    f"exists at {path}. Original error: {exc!r}"
                ) from exc
    else:
        creds = _load_file_credentials(path)

    return build("calendar", "v3", credentials=creds, cache_discovery=False)


async def list_events(time_min: str, time_max: str) -> list[dict]:
    def _call():
        return (
            _get_service()
            .events()
            .list(
                calendarId="primary",
                timeMin=time_min,
                timeMax=time_max,
                singleEvents=True,
                orderBy="startTime",
                timeZone=settings.user_timezone,
            )
            .execute()
            .get("items", [])
        )

    return await asyncio.to_thread(_call)


async def create_event(
    title: str, start: str, end: str, attendees: list[str], description: str | None
) -> dict:
    def _call():
        body: dict = {
            "summary": title,
            "start": {"dateTime": start, "timeZone": settings.user_timezone},
            "end": {"dateTime": end, "timeZone": settings.user_timezone},
            "attendees": [{"email": e} for e in attendees],
        }
        if description:
            body["description"] = description
        return _get_service().events().insert(calendarId="primary", body=body).execute()

    return await asyncio.to_thread(_call)


async def update_event(event_id: str, changes: dict) -> dict:
    def _call():
        svc = _get_service()
        ev = svc.events().get(calendarId="primary", eventId=event_id).execute()
        if "title" in changes:
            ev["summary"] = changes["title"]
        if "start" in changes:
            ev["start"] = {"dateTime": changes["start"], "timeZone": settings.user_timezone}
        if "end" in changes:
            ev["end"] = {"dateTime": changes["end"], "timeZone": settings.user_timezone}
        if "attendees" in changes:
            ev["attendees"] = [{"email": e} for e in changes["attendees"]]
        return svc.events().update(calendarId="primary", eventId=event_id, body=ev).execute()

    return await asyncio.to_thread(_call)
