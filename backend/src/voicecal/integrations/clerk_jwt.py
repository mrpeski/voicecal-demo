"""Verify Clerk session JWTs (Authorization: Bearer) using the instance JWKS."""

from __future__ import annotations

import jwt
import structlog
from jwt import PyJWKClient

from voicecal.config.settings import settings
from voicecal.core.errors import UnauthorizedError

log = structlog.get_logger()

_jwks_client: PyJWKClient | None = None


def _get_jwks_client() -> PyJWKClient:
    global _jwks_client
    if _jwks_client is None:
        url = settings.clerk_jwks_url.strip()
        if not url:
            raise RuntimeError("clerk_jwks_url is empty")
        _jwks_client = PyJWKClient(
            url,
            cache_keys=True,
            max_cached_keys=16,
            lifespan=3600,
        )
    return _jwks_client


def verify_clerk_session_jwt_return_sub(token: str) -> str:
    """Decode and verify a Clerk session token; return the `sub` (Clerk user id)."""
    jwks = _get_jwks_client()
    try:
        key = jwks.get_signing_key_from_jwt(token)
    except Exception as exc:
        log.warning("clerk_jwks_lookup_failed", error=str(exc))
        raise UnauthorizedError("Invalid session") from exc

    iss = settings.clerk_issuer.strip()
    try:
        payload = jwt.decode(
            token,
            key.key,
            algorithms=["RS256", "RS512", "ES256", "ES384", "ES512", "EdDSA"],
            issuer=iss if iss else None,
            options={
                "verify_exp": True,
                "require": ["exp", "sub"],
                "verify_iss": bool(iss),
            },
        )
    except jwt.PyJWTError as exc:
        log.warning("clerk_jwt_invalid", error=str(exc))
        raise UnauthorizedError("Invalid or expired session") from exc

    sub = payload.get("sub")
    if not sub or not isinstance(sub, str):
        raise UnauthorizedError("Invalid session token")
    return sub
