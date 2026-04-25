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


@pytest.fixture(autouse=True)
def _test_settings() -> None:
    # Keep tests fully local/offline.
    settings.mock_providers = True
    settings.mock_llm = True


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

    monkeypatch.setattr("voicecal.app.run_agent", fake_run_agent)

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

    monkeypatch.setattr("voicecal.app.stream_evals", fake_stream_evals)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post("/api/eval")

    assert resp.status_code == 200
    payloads = _sse_payloads(resp.text)
    assert len(payloads) >= 3
    assert '"type":"eval"' in payloads[0]
    assert '"status":"running"' in payloads[0]
    assert '"status":"pass"' in payloads[1]
    assert payloads[-1] == "[DONE]"
