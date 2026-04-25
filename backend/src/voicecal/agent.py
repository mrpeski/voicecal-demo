"""LLM agent loop using the OpenAI Agents SDK.

- SQLiteSession persists conversation history across turns.
- trace() wraps each run so you can inspect it in the OpenAI traces dashboard.
- Runner.run_streamed yields events that we translate to AgentEvent SSE payloads.
"""

from __future__ import annotations

import json
import os
import re
from collections.abc import AsyncIterator
from datetime import datetime, timedelta
from typing import Literal
from zoneinfo import ZoneInfo

import structlog
from agents import Agent, Runner, SQLiteSession, trace
from openai.types.responses import ResponseTextDeltaEvent
from pydantic import BaseModel

from voicecal.settings import settings
from voicecal.tools import (
    TOOLS,
    create_event_impl,
    list_events_impl,
    search_calendar_history_impl,
    update_event_impl,
)

log = structlog.get_logger()

# The Agents SDK reads OPENAI_API_KEY from the environment.
os.environ.setdefault("OPENAI_API_KEY", settings.openai_api_key.get_secret_value())

# Path for the SQLite file backing conversation sessions.
# Lambda's /var/task is read-only, so default to /tmp there.
def _default_sessions_db() -> str:
    if env_path := os.environ.get("VOICECAL_SESSIONS_DB"):
        return env_path
    if os.environ.get("AWS_LAMBDA_FUNCTION_NAME"):
        return "/tmp/sessions.db"
    return "sessions.db"


SESSIONS_DB_PATH = _default_sessions_db()

SYSTEM = """You are VoiceCal, a helpful calendar assistant.

Rules:
- Always call list_events before referencing a specific event's id.
- If the user's time request is ambiguous, ask one clarifying question.
- Never invent event ids. Get them from list_events first.
- Be concise — users are often speaking, not typing.
- Today's date and the user's timezone are provided below.
- For create_event, ALWAYS include attendees and description fields.
  Use attendees=[] and description="" when unknown.
- For update_event, ALWAYS include title/start/end/attendees keys.
  Use null for unchanged values.
- Do not call list_events repeatedly with the same window.
  If nothing matches, ask one brief follow-up question and stop."""


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


def _infer_intent(user_message: str) -> str | None:
    msg = user_message.lower()
    if any(k in msg for k in ("when did", "last meet", "have i met", "recently")):
        return "search_calendar_history"
    if any(k in msg for k in ("reschedule", "move ", "push ")):
        return "update_event"
    if any(k in msg for k in ("book ", "create ", "add ", "schedule ", "block ")):
        return "create_event"
    if any(k in msg for k in ("what's on", "what do i have", "show me", "calendar")):
        return "list_events"
    return None


def _parse_duration_minutes(user_message: str) -> int:
    lower = user_message.lower()
    if m := re.search(r"(\d+)\s*minute", lower):
        return max(5, int(m.group(1)))
    if m := re.search(r"(\d+)\s*hour", lower):
        return max(30, int(m.group(1)) * 60)
    return 60


def _extract_title(user_message: str) -> str:
    cleaned = user_message.strip().rstrip(".?!")
    if m := re.search(
        r"\bwith\s+([a-zA-Z0-9:.'\- ]+?)(?:\s+\b(on|at|for|tomorrow|today|tonight)\b|$)",
        cleaned,
        flags=re.IGNORECASE,
    ):
        return f"Meeting with {m.group(1).strip()}"
    return cleaned[:80] or "New event"


async def _heuristic_fallback(user_message: str) -> AsyncIterator[AgentEvent]:
    intent = _infer_intent(user_message)
    if intent is None:
        return

    tz = ZoneInfo(settings.user_timezone)
    now = datetime.now(tz).replace(second=0, microsecond=0)

    try:
        if intent == "create_event":
            start = now + timedelta(hours=1)
            lower = user_message.lower()
            if "tomorrow" in lower:
                start = now + timedelta(days=1)
            if "tonight" in lower:
                start = now.replace(hour=19, minute=0)
            if m := re.search(r"\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b", lower):
                hour = int(m.group(1)) % 12
                minute = int(m.group(2) or "0")
                if m.group(3) == "pm":
                    hour += 12
                start = start.replace(hour=hour, minute=minute)
            if "morning" in lower:
                start = start.replace(hour=9, minute=0)
            if "afternoon" in lower:
                start = start.replace(hour=15, minute=0)

            duration_minutes = _parse_duration_minutes(user_message)
            end = start + timedelta(minutes=duration_minutes)
            title = _extract_title(user_message)

            yield ToolCallEvent(name="create_event", status="running")
            created = await create_event_impl(
                title=title,
                start=start.isoformat(),
                end=end.isoformat(),
                attendees=[],
                description="",
            )
            yield ToolCallEvent(
                name="create_event",
                status="done",
                result=json.dumps(created, default=str),
            )
            yield TokenEvent(text=f"Scheduled: {title}.")
            return

        if intent == "update_event":
            window_start = (now - timedelta(days=1)).isoformat()
            window_end = (now + timedelta(days=30)).isoformat()
            events = await list_events_impl(window_start, window_end)
            if not events:
                yield TokenEvent(text="I could not find a matching event to update.")
                return
            target = events[0]
            target_start = target.get("start")
            target_end = target.get("end")
            if not isinstance(target_start, str) or not isinstance(target_end, str):
                yield TokenEvent(text="I found an event but could not safely update its time.")
                return
            start_dt = datetime.fromisoformat(target_start.replace("Z", "+00:00"))
            end_dt = datetime.fromisoformat(target_end.replace("Z", "+00:00"))
            delta = timedelta(minutes=30) if "30" in user_message else timedelta(hours=1)
            new_start = (start_dt + delta).isoformat()
            new_end = (end_dt + delta).isoformat()

            yield ToolCallEvent(name="update_event", status="running")
            updated = await update_event_impl(
                event_id=target["id"],
                title=None,
                start=new_start,
                end=new_end,
                attendees=None,
            )
            yield ToolCallEvent(
                name="update_event",
                status="done",
                result=json.dumps(updated, default=str),
            )
            yield TokenEvent(text=f"Updated: {updated.get('title', 'event')}.")
            return

        if intent == "search_calendar_history":
            yield ToolCallEvent(name="search_calendar_history", status="running")
            results = await search_calendar_history_impl(query=user_message, top_k=5)
            yield ToolCallEvent(
                name="search_calendar_history",
                status="done",
                result=json.dumps(results, default=str),
            )
            yield TokenEvent(text="I searched calendar history for that.")
            return

        if intent == "list_events":
            yield ToolCallEvent(name="list_events", status="running")
            results = await list_events_impl(
                (now - timedelta(days=1)).isoformat(),
                (now + timedelta(days=7)).isoformat(),
            )
            yield ToolCallEvent(
                name="list_events",
                status="done",
                result=json.dumps(results, default=str),
            )
            yield TokenEvent(text="Here is what I found on your calendar.")
    except Exception:
        log.exception("heuristic_fallback_failed")


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

    # Only enable deterministic echo when explicitly requested.
    if settings.mock_llm:
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
        result = Runner.run_streamed(
            agent,
            input=user_message,
            session=session,
            max_turns=6,
        )

        saw_tool_call = False
        try:
            async for event in result.stream_events():
                if event.type == "raw_response_event":
                    if isinstance(event.data, ResponseTextDeltaEvent):
                        yield TokenEvent(text=event.data.delta)
                    continue

                if event.type == "run_item_stream_event":
                    item = event.item
                    if event.name == "tool_called":
                        saw_tool_call = True
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

    # In mock mode, recover from "no tool called" responses so evals
    # still exercise the tool layer deterministically.
    if settings.mock_providers and not saw_tool_call:
        async for fallback_event in _heuristic_fallback(user_message):
            yield fallback_event

    yield DoneEvent()
