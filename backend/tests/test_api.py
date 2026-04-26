from __future__ import annotations

from collections.abc import AsyncIterator

import pytest
from httpx import ASGITransport, AsyncClient

from voicecal.agent import DoneEvent, TokenEvent, ToolCallEvent
from voicecal.app import app
from voicecal.eval import EvalEvent, EvalResult
from voicecal.settings import settings


def _sse_payloads(raw: str) -> list[str]:
    payloads: list[str] = []
    for frame in raw.split("\n\n"):
        for line in frame.splitlines():
            if line.startswith("data: "):
                payloads.append(line[6:])
    return payloads


@pytest.mark.asyncio
async def test_health_returns_expected_shape() -> None:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/health")

    assert resp.status_code == 200
    assert resp.json() == {"status": "ok", "service": "voicecal"}


@pytest.mark.asyncio
async def test_chat_stream_contract(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_run_agent(_msg: str, _conversation_id: str) -> AsyncIterator[object]:
        yield TokenEvent(text="hello ")
        yield ToolCallEvent(name="list_events", status="running")
        yield ToolCallEvent(name="list_events", status="done", result='{"ok": true}')
        yield DoneEvent()

    monkeypatch.setattr("voicecal.api.main.run_agent", fake_run_agent)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post("/api/chat", json={"message": "hi"})

    assert resp.status_code == 200
    payloads = _sse_payloads(resp.text)
    assert payloads[0].startswith('{"type": "session", "conversation_id": "')
    assert any('"type":"token"' in p for p in payloads)
    assert any('"type":"tool_call"' in p for p in payloads)
    assert payloads[-1] == "[DONE]"


@pytest.mark.asyncio
async def test_eval_stream_contract(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_stream_evals() -> AsyncIterator[EvalEvent]:
        yield EvalEvent(
            result=EvalResult(
                id="e001",
                utterance="what is on my calendar today?",
                expected_tool="list_events",
                status="running",
            )
        )
        yield EvalEvent(
            result=EvalResult(
                id="e001",
                utterance="what is on my calendar today?",
                expected_tool="list_events",
                status="pass",
                actual_tools=["list_events"],
                response_text="You have no events.",
                duration_ms=12,
            )
        )

    monkeypatch.setattr("voicecal.api.main.stream_evals", fake_stream_evals)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post("/api/eval")

    assert resp.status_code == 200
    payloads = _sse_payloads(resp.text)
    assert len(payloads) >= 3
    assert '"type":"eval"' in payloads[0]
    assert '"status":"running"' in payloads[0]
    assert '"status":"pass"' in payloads[1]
    assert payloads[-1] == "[DONE]"


@pytest.mark.asyncio
async def test_chat_rejects_message_over_limit(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "max_user_message_chars", 3, raising=False)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post("/api/chat", json={"message": "toolong"})
    assert resp.status_code == 422
    body = resp.json()["error"]
    assert body["code"] == "validation_error"
    assert "maximum" in body["message"].lower()


@pytest.mark.asyncio
async def test_chat_rate_limited_after_budget(monkeypatch: pytest.MonkeyPatch) -> None:
    """The third in-window request returns 429 when the per-client limit is 2."""

    async def light_agent(_msg: str, _conversation_id: str) -> AsyncIterator[object]:
        yield DoneEvent()

    monkeypatch.setattr("voicecal.api.main.run_agent", light_agent)
    monkeypatch.setattr(settings, "rate_limit_max_requests", 2, raising=False)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        assert (await client.post("/api/chat", json={"message": "a"})).status_code == 200
        assert (await client.post("/api/chat", json={"message": "b"})).status_code == 200
        r3 = await client.post("/api/chat", json={"message": "c"})

    assert r3.status_code == 429
    assert r3.json()["error"]["code"] == "rate_limited"


@pytest.mark.asyncio
async def test_chat_rejects_off_topic_long_message() -> None:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post(
            "/api/chat",
            json={"message": "Lorem ipsum dolor " * 20},
        )
    assert resp.status_code == 422
    assert resp.json()["error"]["code"] == "use_policy"
