"""Intent classifier: JSON parse helper and skip path when a calendar cue matches."""

from __future__ import annotations

import json
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
from pydantic import SecretStr

from voicecal.core.errors import UsePolicyError
from voicecal.intent_classifier import _parse_in_scope, require_in_scope_by_classifier
from voicecal.settings import settings


def test_parse_in_scope_json() -> None:
    assert _parse_in_scope('{"in_scope": true}') is True
    assert _parse_in_scope('```json\n{"in_scope": false}\n```') is False
    assert _parse_in_scope("") is None


def test_parse_in_scope_embedded() -> None:
    text = "Result: " + json.dumps({"in_scope": True})
    assert _parse_in_scope(text) is True


@pytest.mark.asyncio
async def test_classifier_skips_openai_when_calendar_cue(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    call = MagicMock()
    call.chat.completions.create = AsyncMock(side_effect=RuntimeError("should not call"))
    monkeypatch.setattr("voicecal.intent_classifier._get_client", lambda: call)
    monkeypatch.setattr(settings, "intent_classifier_enabled", True, raising=False)
    await require_in_scope_by_classifier("book lunch for tomorrow with Sam")
    call.chat.completions.create.assert_not_called()


@pytest.mark.asyncio
async def test_classifier_rejects_on_false(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    msg = "tell me a joke about recursion"
    comp = SimpleNamespace(
        choices=[
            SimpleNamespace(message=SimpleNamespace(content='{"in_scope": false}')),
        ]
    )
    call = MagicMock()
    call.chat.completions.create = AsyncMock(return_value=comp)
    monkeypatch.setattr("voicecal.intent_classifier._get_client", lambda: call)
    monkeypatch.setattr(settings, "intent_classifier_enabled", True, raising=False)
    monkeypatch.setattr(settings, "openai_api_key", SecretStr("sk-test"), raising=False)
    with pytest.raises(UsePolicyError, match="only help"):
        await require_in_scope_by_classifier(msg)
    call.chat.completions.create.assert_called_once()
