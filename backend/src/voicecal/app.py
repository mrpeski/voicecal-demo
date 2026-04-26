"""ASGI entrypoint. Keeps the stable `uvicorn voicecal.app:app` import string."""

from voicecal.api.main import app

__all__ = ["app"]
