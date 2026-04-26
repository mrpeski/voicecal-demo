"""Shared FastAPI dependencies (Clerk session, etc.)."""

from __future__ import annotations

import asyncio

import structlog
from fastapi import Request

from voicecal.config.settings import settings
from voicecal.core.errors import ClerkConfigError, UnauthorizedError
from voicecal.integrations.clerk_jwt import verify_clerk_session_jwt_return_sub

log = structlog.get_logger()

# Used when Clerk is off (local dev, tests) — not a real account id.
_DEV_CLERK_USER_ID = "dev-user"


def _clerk_protection_active() -> bool:
    if not settings.clerk_enabled:
        return False
    if not settings.clerk_jwks_url.strip() or not settings.clerk_issuer.strip():
        log.error(
            "clerk_misconfigured",
            message="CLERK_ENABLED is true but CLERK_JWKS_URL or CLERK_ISSUER is empty",
        )
        raise ClerkConfigError(
            "Clerk is enabled but not configured. Set CLERK_JWKS_URL and CLERK_ISSUER."
        )
    return True


async def require_clerk_user_id(request: Request) -> str:
    """Return authenticated Clerk user id, or a dev id when Clerk is disabled.

    PyJWKClient performs sync HTTP; run verification in a thread so the asyncio
    loop is not blocked (otherwise SSE and plain JSON responses appear to hang).
    """
    if not _clerk_protection_active():
        return _DEV_CLERK_USER_ID

    auth = (request.headers.get("authorization") or "").strip()
    if not auth.lower().startswith("bearer "):
        raise UnauthorizedError("Sign in required.")
    token = auth[7:].strip()
    if not token:
        raise UnauthorizedError("Sign in required.")
    return await asyncio.to_thread(verify_clerk_session_jwt_return_sub, token)
