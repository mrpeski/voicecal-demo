"""LLM agent loop using the OpenAI Agents SDK.

- SQLiteSession persists conversation history across turns.
- trace() wraps each run so you can inspect it in the OpenAI traces dashboard.
- Runner.run_streamed yields events that we translate to AgentEvent SSE payloads.
"""

from __future__ import annotations

import json
import os
from collections.abc import AsyncIterator
from datetime import datetime
from typing import Literal
from zoneinfo import ZoneInfo

import structlog
from agents import Agent, Runner, SQLiteSession, trace
from openai.types.responses import ResponseTextDeltaEvent
from pydantic import BaseModel

from voicecal.settings import settings
from voicecal.tools import TOOLS

log = structlog.get_logger()

# The Agents SDK reads OPENAI_API_KEY from the environment.
os.environ.setdefault("OPENAI_API_KEY", settings.openai_api_key.get_secret_value())

# Path for the SQLite file backing conversation sessions.
# Lives alongside token.json in the backend directory by default.
SESSIONS_DB_PATH = os.environ.get("VOICECAL_SESSIONS_DB", "sessions.db")

SYSTEM = """You are VoiceCal, a helpful calendar assistant.

Rules:
- Always call list_events before referencing a specific event's id.
- If the user's time request is ambiguous, ask one clarifying question.
- Never invent event ids. Get them from list_events first.
- Be concise — users are often speaking, not typing.
- Today's date and the user's timezone are provided below."""


class TokenEvent(BaseModel):
    type: Literal["token"] = "token"
    text: str


class ToolCallEvent(BaseModel):
    type: Literal["tool_call"] = "tool_call"
    name: str
    status: Literal["running", "done", "error"]
    result: str | None = None


class DoneEvent(BaseModel):
    type: Literal["done"] = "done"


AgentEvent = TokenEvent | ToolCallEvent | DoneEvent


def _build_agent(instructions: str) -> Agent:
    return Agent(
        name="VoiceCal",
        instructions=instructions,
        model="gpt-4o-mini",
        tools=TOOLS,
    )


def get_session(conversation_id: str) -> SQLiteSession:
    """Return a persistent session for this conversation id.

    All turns with the same id share history automatically — the SDK
    loads prior items from SQLite and appends new ones after each run.
    """
    return SQLiteSession(conversation_id, SESSIONS_DB_PATH)


async def run_agent(
    user_message: str,
    conversation_id: str,
) -> AsyncIterator[AgentEvent]:
    """Run one agent turn.

    History is loaded and persisted automatically via SQLiteSession, so
    callers only pass the new user message + a stable conversation id.
    """
    tz = ZoneInfo(settings.user_timezone)
    now = datetime.now(tz).strftime("%A %d %B %Y, %H:%M %Z")
    instructions = f"{SYSTEM}\n\nCurrent time: {now}\nUser timezone: {settings.user_timezone}"

    if settings.mock_providers:
        response_text = f"You said: {user_message}"
        for word in response_text.split(" "):
            yield TokenEvent(text=word + " ")
        yield DoneEvent()
        return

    agent = _build_agent(instructions)
    session = get_session(conversation_id)

    # trace() groups the LLM calls, tool calls, and handoffs from this turn
    # into one workflow in the OpenAI traces dashboard. group_id lets you
    # link multiple turns in the same conversation together.
    with trace(
        workflow_name="voicecal.turn",
        group_id=conversation_id,
        metadata={
            "user_timezone": settings.user_timezone,
            "model": "gpt-4o-mini",
        },
    ):
        result = Runner.run_streamed(agent, input=user_message, session=session)

        try:
            async for event in result.stream_events():
                if event.type == "raw_response_event":
                    if isinstance(event.data, ResponseTextDeltaEvent):
                        yield TokenEvent(text=event.data.delta)
                    continue

                if event.type == "run_item_stream_event":
                    item = event.item
                    if event.name == "tool_called":
                        name = getattr(item.raw_item, "name", "tool")
                        yield ToolCallEvent(name=name, status="running")
                    elif event.name == "tool_output":
                        name = (
                            getattr(item.raw_item, "name", "tool")
                            if hasattr(item, "raw_item")
                            else "tool"
                        )
                        try:
                            result_str = json.dumps(item.output, default=str)
                        except (TypeError, ValueError):
                            result_str = str(item.output)
                        yield ToolCallEvent(
                            name=name,
                            status="done",
                            result=result_str,
                        )
                    continue
        except Exception:
            log.exception("agent_error", conversation_id=conversation_id)
            yield ToolCallEvent(name="agent", status="error", result="agent run failed")

    yield DoneEvent()
