"""Unit tests for tool *impl* helpers in mock (in-memory) mode."""

from __future__ import annotations

import uuid

import pytest

from voicecal import tools
from voicecal.errors import NotFoundError
from voicecal.tools import (
    create_event_impl,
    list_events_impl,
    search_calendar_history_impl,
    update_event_impl,
)


@pytest.fixture(autouse=True)
def _clear_mock_events() -> None:
    tools._events.clear()
    yield
    tools._events.clear()


@pytest.mark.asyncio
async def test_list_events_empty() -> None:
    out = await list_events_impl(
        "2026-01-10T00:00:00+00:00",
        "2026-01-11T00:00:00+00:00",
    )
    assert out == []


@pytest.mark.asyncio
async def test_create_list_and_sorts_by_start() -> None:
    a = await create_event_impl(
        "Earlier",
        "2026-02-01T10:00:00+00:00",
        "2026-02-01T11:00:00+00:00",
        attendees=["a@example.com"],
        description="A",
    )
    b = await create_event_impl(
        "Later",
        "2026-02-01T14:00:00+00:00",
        "2026-02-01T15:00:00+00:00",
    )
    window = (
        "2026-02-01T00:00:00+00:00",
        "2026-02-02T00:00:00+00:00",
    )
    listed = await list_events_impl(*window)
    assert [e["id"] for e in listed] == [a["id"], b["id"]]
    assert listed[0]["title"] == "Earlier"
    assert listed[0]["attendees"] == ["a@example.com"]
    assert listed[0]["description"] == "A"


@pytest.mark.asyncio
async def test_list_events_excludes_outside_range() -> None:
    ev = await create_event_impl(
        "Edge",
        "2026-03-01T12:00:00+00:00",
        "2026-03-01T13:00:00+00:00",
    )
    inside = await list_events_impl(
        "2026-03-01T00:00:00+00:00",
        "2026-03-01T20:00:00+00:00",
    )
    assert len(inside) == 1 and inside[0]["id"] == ev["id"]
    after = await list_events_impl(
        "2026-03-01T20:00:00+00:00",
        "2026-03-02T00:00:00+00:00",
    )
    assert after == []


@pytest.mark.asyncio
async def test_update_event_patches_in_place() -> None:
    created = await create_event_impl(
        "T",
        "2026-04-01T09:00:00+00:00",
        "2026-04-01T10:00:00+00:00",
    )
    eid = created["id"]
    out = await update_event_impl(
        eid,
        title="New title",
        start="2026-04-01T11:00:00+00:00",
        end=None,
        attendees=["x@x.com"],
    )
    assert out["title"] == "New title"
    assert out["start"] == "2026-04-01T11:00:00+00:00"
    assert out["end"] == "2026-04-01T10:00:00+00:00"
    assert out["attendees"] == ["x@x.com"]
    assert tools._events[eid] is out


@pytest.mark.asyncio
async def test_update_event_not_found() -> None:
    with pytest.raises(NotFoundError, match="not found"):
        await update_event_impl(str(uuid.uuid4()), title="nope")


@pytest.mark.asyncio
async def test_search_calendar_history_clamps_top_k(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    seen: list[int] = []

    async def fake_search(_query: str, top_k: int = 5) -> list[dict]:
        seen.append(top_k)
        return []

    monkeypatch.setattr("voicecal.tools.search", fake_search)
    assert await search_calendar_history_impl("q", top_k=0) == []
    assert await search_calendar_history_impl("q", top_k=50) == []
    assert seen == [1, 10]
