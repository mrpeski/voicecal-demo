"""Golden-set eval harness for the VoiceCal agent.

Runs each scenario through the same agent loop as `/api/chat`, but forces
`mock_providers=True` so tools never hit Google Calendar (deterministic + fast).
The LLM is real — that's what we're evaluating.

Usage:
    uv run python -m voicecal.eval                # run all, print summary
    POST /api/eval                                # SSE stream, one event per scenario
"""

from __future__ import annotations

import asyncio
import json
import time
import uuid
from collections.abc import AsyncIterator
from pathlib import Path
from typing import Literal

from pydantic import BaseModel

from voicecal.agent import ToolCallEvent, run_agent
from voicecal.settings import settings
from voicecal.tools import _events  # in-memory mock store

GOLDEN_PATH = Path(__file__).resolve().parents[3] / "eval" / "golden.jsonl"

EvalStatus = Literal["running", "pass", "fail", "error"]


class GoldenScenario(BaseModel):
    id: str
    utterance: str
    expected_tool: str
    must_mention: list[str] = []


class EvalResult(BaseModel):
    id: str
    utterance: str
    expected_tool: str
    status: EvalStatus
    actual_tools: list[str] = []
    response_text: str = ""
    duration_ms: int = 0
    failure_reason: str | None = None


class EvalEvent(BaseModel):
    """Streamed to the frontend per scenario state change."""

    type: Literal["eval"] = "eval"
    result: EvalResult


def load_golden(path: Path = GOLDEN_PATH) -> list[GoldenScenario]:
    rows: list[GoldenScenario] = []
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        rows.append(GoldenScenario.model_validate(json.loads(line)))
    return rows


async def _run_one(scenario: GoldenScenario) -> EvalResult:
    start = time.monotonic()
    actual_tools: list[str] = []
    response_text = ""
    conversation_id = f"eval-{scenario.id}-{uuid.uuid4().hex[:6]}"

    try:
        async for event in run_agent(scenario.utterance, conversation_id):
            if isinstance(event, ToolCallEvent):
                if event.status == "running":
                    actual_tools.append(event.name)
            elif hasattr(event, "text"):  # TokenEvent
                response_text += event.text
    except Exception as exc:
        return EvalResult(
            id=scenario.id,
            utterance=scenario.utterance,
            expected_tool=scenario.expected_tool,
            status="error",
            actual_tools=actual_tools,
            response_text=response_text,
            duration_ms=int((time.monotonic() - start) * 1000),
            failure_reason=f"{type(exc).__name__}: {exc}",
        )

    duration_ms = int((time.monotonic() - start) * 1000)

    # Pass criteria: expected tool was called AND every must_mention substring
    # appears (case-insensitive) somewhere in tool calls + response.
    tool_called = scenario.expected_tool in actual_tools
    haystack = (response_text + " " + " ".join(actual_tools)).lower()
    mentions_ok = all(m.lower() in haystack for m in scenario.must_mention)

    if tool_called and mentions_ok:
        status: EvalStatus = "pass"
        reason = None
    else:
        status = "fail"
        missing = [m for m in scenario.must_mention if m.lower() not in haystack]
        bits = []
        if not tool_called:
            bits.append(f"expected tool '{scenario.expected_tool}', got {actual_tools or 'none'}")
        if missing:
            bits.append(f"missing mentions: {missing}")
        reason = "; ".join(bits)

    return EvalResult(
        id=scenario.id,
        utterance=scenario.utterance,
        expected_tool=scenario.expected_tool,
        status=status,
        actual_tools=actual_tools,
        response_text=response_text,
        duration_ms=duration_ms,
        failure_reason=reason,
    )


async def stream_evals() -> AsyncIterator[EvalEvent]:
    """Yield one EvalEvent per scenario as they complete.

    Forces tool-mock mode for the duration of the run; restores afterward.
    """
    scenarios = load_golden()
    prev_mock = settings.mock_providers
    prev_mock_llm = settings.mock_llm
    settings.mock_providers = True  # tools use in-memory dict
    settings.mock_llm = False  # but the LLM is real
    _events.clear()

    try:
        for scenario in scenarios:
            # Emit a "running" placeholder first so the UI can show it pending.
            yield EvalEvent(
                result=EvalResult(
                    id=scenario.id,
                    utterance=scenario.utterance,
                    expected_tool=scenario.expected_tool,
                    status="running",
                )
            )
            result = await _run_one(scenario)
            yield EvalEvent(result=result)
    finally:
        settings.mock_providers = prev_mock
        settings.mock_llm = prev_mock_llm


async def run_evals() -> list[EvalResult]:
    """Run all golden scenarios and return final results (used by CLI)."""
    out: list[EvalResult] = []
    async for event in stream_evals():
        if event.result.status != "running":
            out.append(event.result)
    return out


def _print_summary(results: list[EvalResult]) -> None:
    passes = sum(1 for r in results if r.status == "pass")
    total = len(results)
    print(f"\n{'=' * 60}")
    print(f"  {passes}/{total} passed ({passes / total:.0%})" if total else "  no scenarios")
    print(f"{'=' * 60}")
    for r in results:
        icon = {"pass": "✓", "fail": "✗", "error": "!"}[r.status]
        line = f"  {icon} {r.id}  {r.utterance[:50]:<50}  {r.duration_ms}ms"
        print(line)
        if r.failure_reason:
            print(f"      → {r.failure_reason}")


if __name__ == "__main__":
    results = asyncio.run(run_evals())
    _print_summary(results)
