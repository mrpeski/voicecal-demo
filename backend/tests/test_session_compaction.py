"""Session implicit compaction: budget / threshold and replace path (mocked LLM)."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import pytest
from pydantic import SecretStr

from voicecal.agent import session_compaction as sc
from voicecal.config.settings import settings


def test_estimate_json_tokens() -> None:
    t = sc._estimate_json_tokens([{"a": "x" * 400}])
    assert t >= 100


@pytest.mark.asyncio
async def test_compact_skips_when_small(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "session_compaction_enabled", True, raising=False)
    monkeypatch.setattr(settings, "mock_llm", False, raising=False)
    monkeypatch.setattr(settings, "mock_providers", True, raising=False)
    monkeypatch.setattr(settings, "compaction_context_budget_tokens", 1_000_000, raising=False)
    monkeypatch.setattr(settings, "compaction_threshold", 0.8, raising=False)
    session = MagicMock()
    session.get_items = AsyncMock(return_value=[{"t": 1}])
    session.clear_session = AsyncMock()
    session.add_items = AsyncMock()
    await sc.maybe_compact_session(session, "hi")
    session.clear_session.assert_not_called()


@pytest.mark.asyncio
async def test_compact_replaces_when_over_threshold(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "session_compaction_enabled", True, raising=False)
    monkeypatch.setattr(settings, "mock_llm", False, raising=False)
    monkeypatch.setattr(settings, "mock_providers", True, raising=False)
    monkeypatch.setattr(settings, "compaction_context_budget_tokens", 200, raising=False)
    monkeypatch.setattr(settings, "compaction_threshold", 0.2, raising=False)
    monkeypatch.setattr(settings, "compaction_keep_last_items", 2, raising=False)
    monkeypatch.setattr(settings, "openai_api_key", SecretStr("sk-test"), raising=False)

    big = {"x": "z" * 4_000}
    recent = {"y": 2}
    session = MagicMock()
    session.get_items = AsyncMock(return_value=[big, big, recent, recent])
    session.clear_session = AsyncMock()
    session.add_items = AsyncMock()

    async def _sum(_brief: str) -> str:
        return "Condensed prior chat."

    monkeypatch.setattr(sc, "_llm_compact_summary", _sum)
    await sc.maybe_compact_session(session, "next")
    session.clear_session.assert_called_once()
    assert session.add_items.called
    added = session.add_items.call_args[0][0]
    assert len(added) == 3
    assert added[0]["role"] == "user"
    assert "compacted" in (added[0].get("content", "") or "").lower() or "Condensed" in (
        added[0].get("content", "") or ""
    )
