# PLAN.md — VoiceCal 48-hour build plan

Instructions for coding agents working through this project. Read `AGENTS.md` first, then this file. `AGENTS.md` defines the rules; this file defines the sequence.

**Work phases in order. Do not start Phase N+1 until Phase N has a passing gate check.** Each phase ends with a concrete, runnable assertion. If the gate fails, fix it before moving on — a broken foundation makes every subsequent phase harder.

When you complete a phase, say so explicitly and state the gate result.

---

## Before you start

You are already inside `voicecal-demo` with `AGENTS.md` and `CLAUDE.md` at the
root. Claude Code reads `CLAUDE.md` automatically on startup — no extra setup.

Create the folder structure. Run each `mkdir` separately (brace expansion is
bash-only and silently fails in other shells):

```bash
mkdir -p backend/src/voicecal
mkdir -p backend/scripts
mkdir -p frontend/src/components
mkdir -p frontend/src/lib
mkdir -p eval
```

Create the placeholder files:

```bash
touch backend/src/voicecal/__init__.py
touch eval/golden.jsonl
touch demo-script.md
```

Then proceed to Phase 0.

---

## Phase 0 — skeleton boots (30 minutes)

**Goal:** `uvicorn` starts backend, `pnpm dev` starts frontend, `/health` returns `{"status": "ok"}`.

### 0.1 Backend skeleton

Create `backend/pyproject.toml`:

```toml
[project]
name = "voicecal"
version = "0.1.0"
requires-python = ">=3.12"
dependencies = [
    "fastapi>=0.115",
    "uvicorn[standard]>=0.32",
    "pydantic>=2.9",
    "pydantic-settings>=2.6",
    "anthropic>=0.40",
    "openai>=1.55",
    "google-api-python-client>=2.0",
    "google-auth-oauthlib>=1.2",
    "chromadb>=0.6",
    "structlog>=24.4",
    "python-multipart>=0.0.12",
]

[dependency-groups]
dev = [
    "pytest>=8.0",
    "pytest-asyncio>=0.24",
    "httpx>=0.27",
    "ruff>=0.8",
]

[tool.pytest.ini_options]
asyncio_mode = "auto"

[tool.ruff]
line-length = 100

[tool.ruff.lint]
select = ["E", "F", "I", "B", "UP", "ASYNC", "DTZ"]
ignore = ["B008"]
```

Create `backend/.env.example`:

```
ANTHROPIC_API_KEY=sk-ant-replace_me
OPENAI_API_KEY=sk-replace_me
GOOGLE_CREDENTIALS_PATH=token.json
USER_TIMEZONE=Europe/London
CORS_ORIGINS=http://localhost:5173
MOCK_PROVIDERS=true
```

Create `backend/src/voicecal/settings.py`:

```python
from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env.local", ".env"),
        extra="ignore",
    )

    anthropic_api_key: SecretStr = SecretStr("")
    openai_api_key: SecretStr = SecretStr("")
    google_credentials_path: str = "token.json"
    user_timezone: str = "Europe/London"
    cors_origins: list[str] = ["http://localhost:5173"]
    mock_providers: bool = True


settings = Settings()
```

Create `backend/src/voicecal/errors.py`:

```python
class AppError(Exception):
    code: str = "app_error"
    status_code: int = 500

    def __init__(self, message: str, *, code: str | None = None) -> None:
        super().__init__(message)
        self.message = message
        if code is not None:
            self.code = code


class ValidationError(AppError):
    code = "validation_error"
    status_code = 422


class NotFoundError(AppError):
    code = "not_found"
    status_code = 404


class ProviderError(AppError):
    code = "provider_error"
    status_code = 502


class ToolError(AppError):
    code = "tool_error"
    status_code = 500
```

Create `backend/src/voicecal/app.py` — the minimal skeleton with correct middleware ordering:

```python
import structlog
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from voicecal.errors import AppError
from voicecal.settings import settings

log = structlog.get_logger()


@asynccontextmanager
async def lifespan(app: FastAPI):
    structlog.configure(
        processors=[
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.JSONRenderer(),
        ]
    )
    yield


app = FastAPI(title="voicecal", lifespan=lifespan)


# 1. Exception handlers FIRST — every error path must return a real Response
#    so the CORS middleware can decorate it on the way out.
#    Missing the bare Exception handler is the most common cause of false CORS errors.

@app.exception_handler(AppError)
async def _app_error(request: Request, exc: AppError) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": {"code": exc.code, "message": exc.message}},
    )


@app.exception_handler(StarletteHTTPException)
async def _http_error(request: Request, exc: StarletteHTTPException) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": {"code": "http_error", "message": str(exc.detail)}},
    )


@app.exception_handler(Exception)
async def _fallback(request: Request, exc: Exception) -> JSONResponse:
    log.exception("unhandled_exception", path=request.url.path)
    return JSONResponse(
        status_code=500,
        content={"error": {"code": "internal_error", "message": "Internal server error"}},
    )


# 2. CORS middleware LAST — outermost layer so it wraps the exception handlers above.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "service": "voicecal"}
```

Run it:

```bash
cd backend
uv sync
cp .env.example .env   # fill in ANTHROPIC_API_KEY at minimum
uv run uvicorn voicecal.app:app --reload --port 8000
```

### 0.2 Frontend skeleton

```bash
cd frontend
pnpm create vite@latest . -- --template react-ts
pnpm add -D tailwindcss @tailwindcss/vite
pnpm install
```

`vite.config.ts`:

```ts
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: { "/api": "http://localhost:8000" },
  },
});
```

`src/styles.css`:

```css
@import "tailwindcss";
```

`src/main.tsx`:

```tsx
import "./styles.css";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

`src/App.tsx`:

```tsx
export default function App() {
  return (
    <div className="min-h-screen bg-zinc-900 text-zinc-100 flex items-center justify-center">
      <p className="text-zinc-400">VoiceCal — loading...</p>
    </div>
  );
}
```

```bash
pnpm dev
```

### Phase 0 gate check

```bash
# 1. Backend health
curl http://localhost:8000/health
# → {"status":"ok","service":"voicecal"}

# 2. Frontend
# Open http://localhost:5173 — renders "VoiceCal — loading..."

# 3. CORS + exception handler: unhandled error still returns CORS header
curl -I -H "Origin: http://localhost:5173" http://localhost:8000/nonexistent
# → 404 response includes access-control-allow-origin header
```

**Do not proceed until all three pass.**

---

## Phase 1 — text chat with in-memory calendar (3 hours)

**Goal:** typing "what's on my calendar today?" in the browser returns an LLM response that called a tool, with tool calls shown inline.

### 1.1 Tools with in-memory backend

Create `backend/src/voicecal/tools.py`:

```python
"""Typed tool definitions for the calendar agent.

Each tool:
  - Has a Pydantic input model with extra="forbid" and Field descriptions
    (descriptions are what the LLM reads when deciding to call a tool)
  - Has a typed output model
  - Has an async handler function
  - Exports a spec() dict in Anthropic tool format

The in-memory _events dict is replaced by the Google Calendar client in Phase 2.
"""

from __future__ import annotations

import uuid
from pydantic import BaseModel, ConfigDict, Field

from voicecal.errors import NotFoundError

# In-memory calendar — replaced in Phase 2.
_events: dict[str, dict] = {}


# ---------- list_events ----------

class ListEventsInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    time_range_start: str = Field(description="ISO 8601 datetime, inclusive")
    time_range_end: str = Field(description="ISO 8601 datetime, exclusive")


class EventOut(BaseModel):
    id: str
    title: str
    start: str
    end: str
    attendees: list[str] = []
    description: str | None = None


async def handle_list_events(inp: ListEventsInput) -> list[EventOut]:
    return [EventOut(**ev) for ev in sorted(_events.values(), key=lambda e: e["start"])]


def list_events_spec() -> dict:
    return {
        "name": "list_events",
        "description": "List calendar events in a time range. Use this whenever the user asks what is on their calendar.",
        "input_schema": ListEventsInput.model_json_schema(),
    }


# ---------- create_event ----------

class CreateEventInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: str = Field(description="Event title")
    start: str = Field(description="ISO 8601 datetime in the user's timezone")
    end: str = Field(description="ISO 8601 datetime in the user's timezone")
    attendees: list[str] = Field(default=[], description="Attendee email addresses")
    description: str | None = Field(default=None, description="Optional description")


async def handle_create_event(inp: CreateEventInput) -> EventOut:
    event_id = str(uuid.uuid4())
    ev = {"id": event_id, "title": inp.title, "start": inp.start,
          "end": inp.end, "attendees": inp.attendees, "description": inp.description}
    _events[event_id] = ev
    return EventOut(**ev)


def create_event_spec() -> dict:
    return {
        "name": "create_event",
        "description": "Create a new calendar event. If the time is ambiguous, confirm with the user first.",
        "input_schema": CreateEventInput.model_json_schema(),
    }


# ---------- update_event ----------

class UpdateEventInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    event_id: str = Field(description="Event id from list_events — never guess this")
    title: str | None = Field(default=None, description="New title")
    start: str | None = Field(default=None, description="New start time")
    end: str | None = Field(default=None, description="New end time")
    attendees: list[str] | None = Field(default=None, description="New attendee list")


async def handle_update_event(inp: UpdateEventInput) -> EventOut:
    if inp.event_id not in _events:
        raise NotFoundError(f"Event {inp.event_id} not found")
    ev = _events[inp.event_id]
    if inp.title is not None: ev["title"] = inp.title
    if inp.start is not None: ev["start"] = inp.start
    if inp.end is not None: ev["end"] = inp.end
    if inp.attendees is not None: ev["attendees"] = inp.attendees
    return EventOut(**ev)


def update_event_spec() -> dict:
    return {
        "name": "update_event",
        "description": "Update an existing event. Always call list_events first to get a real event id.",
        "input_schema": UpdateEventInput.model_json_schema(),
    }


# ---------- registry ----------

TOOL_SPECS = [list_events_spec(), create_event_spec(), update_event_spec()]

TOOL_HANDLERS: dict[str, object] = {
    "list_events": handle_list_events,
    "create_event": handle_create_event,
    "update_event": handle_update_event,
}

INPUT_MODELS: dict[str, type] = {
    "list_events": ListEventsInput,
    "create_event": CreateEventInput,
    "update_event": UpdateEventInput,
}
```

### 1.2 Agent loop with SSE streaming

Create `backend/src/voicecal/agent.py`:

```python
"""LLM agent loop using Anthropic's native tool-calling.

No agent frameworks. Direct SDK. Yields AgentEvent objects that the
HTTP layer serializes to SSE data lines.
"""

from __future__ import annotations

import json
from datetime import datetime
from typing import AsyncIterator, Literal
from zoneinfo import ZoneInfo

import anthropic
import structlog
from pydantic import BaseModel

from voicecal.settings import settings
from voicecal.tools import INPUT_MODELS, TOOL_HANDLERS, TOOL_SPECS

MAX_ITERATIONS = 6
log = structlog.get_logger()

client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key.get_secret_value())

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


async def run_agent(
    user_message: str,
    history: list[dict],
) -> AsyncIterator[AgentEvent]:
    tz = ZoneInfo(settings.user_timezone)
    now = datetime.now(tz).strftime("%A %d %B %Y, %H:%M %Z")
    system = f"{SYSTEM}\n\nCurrent time: {now}\nUser timezone: {settings.user_timezone}"

    messages = history + [{"role": "user", "content": user_message}]

    for _i in range(MAX_ITERATIONS):
        response = await client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=1024,
            system=system,
            tools=TOOL_SPECS,
            messages=messages,
        )

        # Yield text tokens word-by-word for streaming feel.
        for block in response.content:
            if block.type == "text":
                for word in block.text.split(" "):
                    yield TokenEvent(text=word + " ")

        tool_uses = [b for b in response.content if b.type == "tool_use"]
        if not tool_uses:
            break

        messages.append({"role": "assistant", "content": response.content})

        tool_results = []
        for tu in tool_uses:
            yield ToolCallEvent(name=tu.name, status="running")
            handler = TOOL_HANDLERS.get(tu.name)
            model_cls = INPUT_MODELS.get(tu.name)
            if handler is None or model_cls is None:
                err = f"Unknown tool: {tu.name}"
                yield ToolCallEvent(name=tu.name, status="error", result=err)
                tool_results.append({
                    "type": "tool_result", "tool_use_id": tu.id,
                    "content": err, "is_error": True,
                })
                continue
            try:
                result = await handler(model_cls(**tu.input))  # type: ignore[operator]
                result_json = json.dumps(
                    [r.model_dump() for r in result] if isinstance(result, list)
                    else result.model_dump()
                )
                yield ToolCallEvent(name=tu.name, status="done", result=result_json)
                tool_results.append({
                    "type": "tool_result", "tool_use_id": tu.id, "content": result_json,
                })
            except Exception as exc:
                log.exception("tool_error", tool=tu.name)
                err = str(exc)
                yield ToolCallEvent(name=tu.name, status="error", result=err)
                tool_results.append({
                    "type": "tool_result", "tool_use_id": tu.id,
                    "content": err, "is_error": True,
                })

        messages.append({"role": "user", "content": tool_results})

        if response.stop_reason == "end_turn":
            break

    yield DoneEvent()
```

### 1.3 Chat SSE route

Add to `backend/src/voicecal/app.py`:

```python
import json
from pydantic import ConfigDict
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from voicecal.agent import run_agent


class ChatRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    message: str
    history: list[dict] = []


@app.post("/api/chat")
async def chat(req: ChatRequest) -> StreamingResponse:
    async def stream():
        async for event in run_agent(req.message, req.history):
            yield f"data: {event.model_dump_json()}\n\n"
        yield "data: [DONE]\n\n"
    return StreamingResponse(stream(), media_type="text/event-stream")
```

### 1.4 Frontend chat

Create `frontend/src/lib/types.ts`:

```ts
export type TokenEvent = { type: "token"; text: string };
export type ToolCallEvent = {
  type: "tool_call";
  name: string;
  status: "running" | "done" | "error";
  result?: string;
};
export type DoneEvent = { type: "done" };
export type AgentEvent = TokenEvent | ToolCallEvent | DoneEvent;

export type Message = {
  role: "user" | "assistant";
  text: string;
  toolCalls: ToolCallEvent[];
};
```

Create `frontend/src/lib/api.ts`:

```ts
import type { AgentEvent, Message } from "./types";

export async function* streamChat(
  message: string,
  history: Message[],
): AsyncGenerator<AgentEvent> {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message,
      history: history.map((m) => ({ role: m.role, content: m.text })),
    }),
  });
  if (!res.ok || !res.body) throw new Error(`API ${res.status}`);

  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      if (line.startsWith("data: ") && line !== "data: [DONE]")
        yield JSON.parse(line.slice(6)) as AgentEvent;
    }
  }
}
```

Create `frontend/src/components/ToolCall.tsx`:

```tsx
import type { ToolCallEvent } from "../lib/types";

const ICONS: Record<string, string> = {
  list_events: "📅",
  create_event: "➕",
  update_event: "✏️",
  search_calendar_history: "🔍",
};

export function ToolCall({ event }: { event: ToolCallEvent }) {
  const icon = ICONS[event.name] ?? "🔧";
  const label = event.name.replace(/_/g, " ");
  if (event.status === "running")
    return (
      <div className="text-xs text-zinc-400 italic my-1 flex gap-1">
        <span className="animate-pulse">{icon}</span> Calling {label}…
      </div>
    );
  if (event.status === "error")
    return (
      <div className="text-xs text-red-400 my-1">
        ❌ {label}: {event.result}
      </div>
    );
  return (
    <div className="text-xs text-emerald-400 my-1">
      {icon} ✓ {label}
    </div>
  );
}
```

Create `frontend/src/components/MessageBubble.tsx`:

```tsx
import type { Message } from "../lib/types";
import { ToolCall } from "./ToolCall";

export function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";
  return (
    <div className={`flex mb-3 ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm
        ${isUser ? "bg-indigo-600 text-white" : "bg-zinc-800 text-zinc-100"}`}
      >
        {message.toolCalls.map((tc, i) => (
          <ToolCall key={i} event={tc} />
        ))}
        <p className="whitespace-pre-wrap leading-relaxed">{message.text}</p>
      </div>
    </div>
  );
}
```

Create `frontend/src/components/ChatView.tsx`:

```tsx
import { useEffect, useRef, useState } from "react";
import { streamChat } from "../lib/api";
import type { Message, ToolCallEvent } from "../lib/types";
import { MessageBubble } from "./MessageBubble";

export function ChatView() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send(text: string) {
    if (!text.trim() || loading) return;
    setMessages((prev) => [...prev, { role: "user", text, toolCalls: [] }]);
    setInput("");
    setLoading(true);
    setMessages((prev) => [
      ...prev,
      { role: "assistant", text: "", toolCalls: [] },
    ]);

    try {
      for await (const event of streamChat(text, messages)) {
        setMessages((prev) => {
          const updated = [...prev];
          const last = { ...updated[updated.length - 1] };
          if (event.type === "token") {
            last.text += event.text;
          } else if (event.type === "tool_call") {
            const idx = last.toolCalls.findIndex(
              (tc) => tc.name === event.name && tc.status === "running",
            );
            last.toolCalls =
              idx >= 0
                ? last.toolCalls.map((tc, i) =>
                    i === idx ? (event as ToolCallEvent) : tc,
                  )
                : [...last.toolCalls, event as ToolCallEvent];
          }
          updated[updated.length - 1] = last;
          return updated;
        });
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-4">
        {messages.length === 0 && (
          <p className="text-zinc-500 text-sm text-center mt-8">
            Ask about your calendar — try "what's on my calendar this week?"
          </p>
        )}
        {messages.map((m, i) => (
          <MessageBubble key={i} message={m} />
        ))}
        <div ref={bottomRef} />
      </div>
      <div className="border-t border-zinc-800 p-4 flex gap-2">
        <input
          className="flex-1 bg-zinc-800 rounded-xl px-4 py-2 text-sm
                     text-zinc-100 placeholder-zinc-500 outline-none
                     focus:ring-2 focus:ring-indigo-500"
          placeholder="Ask about your calendar…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send(input)}
          disabled={loading}
        />
        <button
          onClick={() => send(input)}
          disabled={loading || !input.trim()}
          className="bg-indigo-600 text-white rounded-xl px-4 py-2 text-sm
                     disabled:opacity-40 hover:bg-indigo-500 transition-colors"
        >
          {loading ? "…" : "Send"}
        </button>
      </div>
    </div>
  );
}
```

Update `App.tsx`:

```tsx
import { ChatView } from "./components/ChatView";

export default function App() {
  return (
    <div className="min-h-screen bg-zinc-900 text-zinc-100 flex flex-col">
      <header className="border-b border-zinc-800 px-6 py-4 flex items-center gap-3">
        <span className="text-xl">📅</span>
        <h1 className="font-semibold">VoiceCal</h1>
        <span
          className="ml-auto w-2 h-2 rounded-full bg-emerald-400"
          title="Connected"
        />
      </header>
      <main className="flex-1 max-w-2xl w-full mx-auto overflow-hidden flex flex-col">
        <ChatView />
      </main>
    </div>
  );
}
```

### Phase 1 gate check

```
Type in browser: "what's on my calendar today?"
→ ToolCall component shows "📅 ✓ list events"
→ Agent responds (calendar is empty at this point)

Type: "book 30 minutes with Alex tomorrow at 2pm"
→ ToolCall shows "➕ ✓ create event"
→ Agent confirms the booking

Tokens must stream in visibly — not appear all at once.
```

**Do not proceed until streaming tool calls are visible.**

---

## Phase 2 — real Google Calendar (2 hours)

**Goal:** same tools now hit your real Google Calendar.

### 2.1 Google OAuth setup

**You (not an agent) must do this manually before any code runs:**

1. Google Cloud Console → New project → Enable Calendar API.
2. OAuth consent screen → External → add your email as test user.
3. Credentials → OAuth 2.0 Client ID → Desktop app → Download `credentials.json` → place in `backend/`.
4. Add `credentials.json` and `token.json` to `.gitignore`.

Create `backend/scripts/auth.py` and run it once to generate `token.json`:

```python
from google_auth_oauthlib.flow import InstalledAppFlow

SCOPES = ["https://www.googleapis.com/auth/calendar"]
flow = InstalledAppFlow.from_client_secrets_file("credentials.json", SCOPES)
creds = flow.run_local_server(port=0)
with open("token.json", "w") as f:
    f.write(creds.to_json())
print("token.json written.")
```

```bash
cd backend && uv run python scripts/auth.py
```

### 2.2 Google Calendar client

Create `backend/src/voicecal/calendar.py`:

```python
"""Google Calendar client. All sync calls wrapped in asyncio.to_thread."""

from __future__ import annotations

import asyncio
import json

from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

from voicecal.settings import settings


def _get_service():
    creds = Credentials.from_authorized_user_file(settings.google_credentials_path)
    return build("calendar", "v3", credentials=creds)


async def list_events(time_min: str, time_max: str) -> list[dict]:
    def _call():
        return _get_service().events().list(
            calendarId="primary", timeMin=time_min, timeMax=time_max,
            singleEvents=True, orderBy="startTime", timeZone=settings.user_timezone,
        ).execute().get("items", [])
    return await asyncio.to_thread(_call)


async def create_event(title: str, start: str, end: str,
                       attendees: list[str], description: str | None) -> dict:
    def _call():
        body: dict = {
            "summary": title,
            "start": {"dateTime": start, "timeZone": settings.user_timezone},
            "end": {"dateTime": end, "timeZone": settings.user_timezone},
            "attendees": [{"email": e} for e in attendees],
        }
        if description:
            body["description"] = description
        return _get_service().events().insert(calendarId="primary", body=body).execute()
    return await asyncio.to_thread(_call)


async def update_event(event_id: str, changes: dict) -> dict:
    def _call():
        svc = _get_service()
        ev = svc.events().get(calendarId="primary", eventId=event_id).execute()
        if "title" in changes:
            ev["summary"] = changes["title"]
        if "start" in changes:
            ev["start"] = {"dateTime": changes["start"], "timeZone": settings.user_timezone}
        if "end" in changes:
            ev["end"] = {"dateTime": changes["end"], "timeZone": settings.user_timezone}
        if "attendees" in changes:
            ev["attendees"] = [{"email": e} for e in changes["attendees"]]
        return svc.events().update(calendarId="primary", eventId=event_id, body=ev).execute()
    return await asyncio.to_thread(_call)
```

### 2.3 Wire calendar.py into tools.py

In `tools.py`, update each handler to delegate to `voicecal.calendar` when `settings.mock_providers` is False:

```python
# In handle_list_events:
async def handle_list_events(inp: ListEventsInput) -> list[EventOut]:
    if not settings.mock_providers:
        from voicecal.calendar import list_events as gcal_list
        items = await gcal_list(inp.time_range_start, inp.time_range_end)
        return [EventOut(
            id=ev["id"],
            title=ev.get("summary", "Untitled"),
            start=ev["start"].get("dateTime", ev["start"].get("date", "")),
            end=ev["end"].get("dateTime", ev["end"].get("date", "")),
            attendees=[a["email"] for a in ev.get("attendees", [])],
            description=ev.get("description"),
        ) for ev in items]
    # in-memory fallback
    return [EventOut(**ev) for ev in sorted(_events.values(), key=lambda e: e["start"])]
```

Apply the same pattern to `handle_create_event` and `handle_update_event`.

### Phase 2 gate check

```
Set MOCK_PROVIDERS=false in backend/.env
Restart the backend.

Type: "what meetings do I have this week?"
→ Real events from your Google Calendar appear in the chat

Type: "create a test event called Demo Test tomorrow at noon for 30 minutes"
→ Event appears in your actual Google Calendar (verify in the Google Calendar UI)

Type: "delete the Demo Test event" or "remove that meeting"
→ (list_events is called first, then update_event or a delete_event if you've added it)
```

---

## Phase 3 — voice (2 hours)

**Goal:** hold the mic button, speak, hear a response.

Time budget is hard. If voice is not working cleanly after 2 hours, cut it and move to Phase 4.

### 3.1 Voice backend

Create `backend/src/voicecal/voice.py`:

```python
"""Voice pipeline: bytes → Whisper → agent → TTS → bytes."""

from __future__ import annotations

import base64
import tempfile
from pathlib import Path

from openai import AsyncOpenAI

from voicecal.settings import settings

_client = AsyncOpenAI(api_key=settings.openai_api_key.get_secret_value())


async def transcribe(audio_bytes: bytes, content_type: str = "audio/webm") -> str:
    suffix = ".webm" if "webm" in content_type else ".mp4"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as f:
        f.write(audio_bytes)
        tmp = f.name
    try:
        with open(tmp, "rb") as af:
            resp = await _client.audio.transcriptions.create(model="whisper-1", file=af)
        return resp.text
    finally:
        Path(tmp).unlink(missing_ok=True)


async def synthesize(text: str) -> bytes:
    resp = await _client.audio.speech.create(
        model="tts-1", voice="alloy", input=text, response_format="mp3"
    )
    return resp.content
```

Add voice route to `app.py`:

```python
import base64
from fastapi import UploadFile, File
from voicecal.voice import transcribe, synthesize
from voicecal.agent import TokenEvent, ToolCallEvent


@app.post("/api/voice")
async def voice_endpoint(audio: UploadFile = File(...)):
    audio_bytes = await audio.read()
    transcript = await transcribe(audio_bytes, audio.content_type or "audio/webm")

    full_text = ""
    tool_calls = []
    async for event in run_agent(transcript, []):
        if event.type == "token":
            full_text += event.text
        elif event.type == "tool_call":
            tool_calls.append(event.model_dump())

    audio_out = await synthesize(full_text.strip())
    return {
        "transcript": transcript,
        "response_text": full_text.strip(),
        "audio_base64": base64.b64encode(audio_out).decode(),
        "tool_calls": tool_calls,
    }
```

Note: `run_agent` must be imported at the top of `app.py` from `voicecal.agent`.

### 3.2 VoiceButton component

Create `frontend/src/components/VoiceButton.tsx`:

```tsx
import { useRef, useState } from "react";
import type { Message } from "../lib/types";

type VoiceResult = {
  transcript: string;
  response_text: string;
  audio_base64: string;
  tool_calls: Message["toolCalls"];
};

interface Props {
  onResult: (r: VoiceResult) => void;
  disabled: boolean;
}

export function VoiceButton({ onResult, disabled }: Props) {
  const [recording, setRecording] = useState(false);
  const mrRef = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);

  async function start() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mr = new MediaRecorder(stream);
    mrRef.current = mr;
    chunks.current = [];
    mr.ondataavailable = (e) => chunks.current.push(e.data);
    mr.start();
    setRecording(true);
  }

  async function stop() {
    const mr = mrRef.current;
    if (!mr) return;
    mr.stop();
    setRecording(false);
    mr.onstop = async () => {
      const blob = new Blob(chunks.current, { type: "audio/webm" });
      if (blob.size < 1000) return; // too short
      const form = new FormData();
      form.append("audio", blob, "rec.webm");
      const res = await fetch("/api/voice", { method: "POST", body: form });
      const data: VoiceResult = await res.json();
      new Audio(`data:audio/mp3;base64,${data.audio_base64}`).play();
      onResult(data);
    };
    mr.stream.getTracks().forEach((t) => t.stop());
  }

  return (
    <button
      className={`w-12 h-12 rounded-full text-xl flex items-center justify-center
        transition-all select-none
        ${
          recording
            ? "bg-red-600 scale-110 animate-pulse shadow-lg shadow-red-900"
            : "bg-zinc-700 hover:bg-zinc-600"
        }
        disabled:opacity-40`}
      onMouseDown={start}
      onMouseUp={stop}
      onTouchStart={start}
      onTouchEnd={stop}
      disabled={disabled}
      title="Hold to speak"
    >
      🎙️
    </button>
  );
}
```

Wire `VoiceButton` into `ChatView`: import it, place it next to the text input, and in `onResult` push the transcript as a user message and the response as an assistant message with its tool calls.

### Phase 3 gate check

```
Open http://localhost:5173 in Chrome (must be localhost for mic permissions)
Hold the mic button, say "what's on my calendar tomorrow?"
→ Button pulses red while recording
→ Transcript appears as a user message
→ Tool call indicator fires (list_events)
→ Audio response plays
→ Response text appears in chat
```

---

## Phase 4 — RAG over calendar history (2 hours)

**Goal:** "when did I last meet with Alex?" uses semantic search over past events.

### 4.1 RAG module

Create `backend/src/voicecal/rag.py`:

```python
"""RAG over calendar history.

Indexes the last 6 months of events at startup.
The search_calendar_history tool queries this index.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import chromadb
from openai import AsyncOpenAI

from voicecal.settings import settings

_chroma = chromadb.Client()
_col = _chroma.get_or_create_collection("calendar_history")
_openai = AsyncOpenAI(api_key=settings.openai_api_key.get_secret_value())


async def _embed(texts: list[str]) -> list[list[float]]:
    resp = await _openai.embeddings.create(model="text-embedding-3-small", input=texts)
    return [r.embedding for r in resp.data]


async def build_index() -> int:
    from voicecal.calendar import list_events
    tz = ZoneInfo(settings.user_timezone)
    now = datetime.now(tz)
    events = await list_events(
        (now - timedelta(days=180)).isoformat(),
        now.isoformat(),
    )
    if not events:
        return 0

    docs, ids, metas = [], [], []
    for ev in events:
        title = ev.get("summary", "Untitled")
        attendees = ", ".join(a.get("email", "") for a in ev.get("attendees", []))
        start = ev.get("start", {}).get("dateTime", "")
        docs.append(f"{title} — {attendees} — {start}")
        ids.append(ev["id"])
        metas.append({"title": title, "start": start, "attendees": attendees})

    embeddings = await _embed(docs)
    _col.upsert(ids=ids, embeddings=embeddings, documents=docs, metadatas=metas)
    return len(docs)


async def search(query: str, top_k: int = 5) -> list[dict]:
    if _col.count() == 0:
        return []
    q_emb = (await _embed([query]))[0]
    results = _col.query(query_embeddings=[q_emb], n_results=min(top_k, _col.count()))
    return [
        {"text": doc, "metadata": meta}
        for doc, meta in zip(results["documents"][0], results["metadatas"][0])
    ]
```

### 4.2 Add search_calendar_history tool

Add to `tools.py`:

```python
class SearchHistoryInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    query: str = Field(description="Natural language query, e.g. 'last meeting with Alex'")
    top_k: int = Field(default=5, description="Number of results")


async def handle_search_calendar_history(inp: SearchHistoryInput) -> list[dict]:
    from voicecal.rag import search
    return await search(inp.query, inp.top_k)


def search_calendar_history_spec() -> dict:
    return {
        "name": "search_calendar_history",
        "description": "Search past calendar events. Use this for questions about past meetings, e.g. 'when did I last meet with Alex?' or 'how often do I meet the design team?'",
        "input_schema": SearchHistoryInput.model_json_schema(),
    }
```

Register it in `TOOL_SPECS`, `TOOL_HANDLERS`, and `INPUT_MODELS`.

### 4.3 Build index at startup + refresh endpoint

In `app.py` lifespan:

```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    # ... existing setup ...
    if not settings.mock_providers:
        from voicecal.rag import build_index
        count = await build_index()
        log.info("rag_index_built", count=count)
    yield
```

Add refresh endpoint for demo day:

```python
@app.post("/api/rag/refresh")
async def rag_refresh():
    from voicecal.rag import build_index
    return {"indexed": await build_index()}
```

### Phase 4 gate check

```
Restart with MOCK_PROVIDERS=false
Check logs: "rag_index_built" with count > 0

Type or say: "when did I last meet with [real person in your calendar]?"
→ search_calendar_history tool fires
→ Response correctly names the event and approximate date
```

---

## Phase 5 — evals (1 hour)

**Goal:** clicking "Run all" runs 20 scenarios and streams pass/fail in real time.

### 5.1 Write golden.jsonl

Populate `eval/golden.jsonl` with 20 lines. Required fields:

```json
{"id":"e001","utterance":"what's on my calendar today?","expected_tool":"list_events","must_mention":[]}
{"id":"e002","utterance":"book 30 minutes with Alex Friday at 3pm","expected_tool":"create_event","must_mention":["Alex"]}
{"id":"e003","utterance":"when did I last meet with Sarah?","expected_tool":"search_calendar_history","must_mention":["Sarah"]}
{"id":"e004","utterance":"move my 3pm meeting to 4pm","expected_tool":"update_event","must_mention":[]}
{"id":"e005","utterance":"what meetings do I have this week?","expected_tool":"list_events","must_mention":[]}
```

Continue to 20 entries. Cover: list queries, creates, updates, RAG, ambiguous inputs, multi-step.

### 5.2 Eval runner

Create `backend/src/voicecal/eval.py`:

```python
from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import AsyncIterator

from voicecal.agent import run_agent

GOLDEN = Path(__file__).parents[4] / "eval" / "golden.jsonl"


@dataclass
class EvalResult:
    id: str
    utterance: str
    passed: bool
    tool_called: str | None
    expected_tool: str
    response_text: str
    reason: str


async def run_evals() -> AsyncIterator[EvalResult]:
    cases = [json.loads(l) for l in GOLDEN.read_text().splitlines() if l.strip()]
    for case in cases:
        tool_called = None
        text = ""
        async for event in run_agent(case["utterance"], []):
            if event.type == "tool_call" and event.status == "done" and tool_called is None:
                tool_called = event.name
            elif event.type == "token":
                text += event.text

        expected = case["expected_tool"]
        mentions = case.get("must_mention", [])
        tool_ok = tool_called == expected
        mention_ok = all(m.lower() in text.lower() for m in mentions)
        passed = tool_ok and mention_ok

        reason = ""
        if not tool_ok:
            reason = f"expected={expected} got={tool_called}"
        elif not mention_ok:
            reason = f"missing: {[m for m in mentions if m.lower() not in text.lower()]}"

        yield EvalResult(
            id=case["id"], utterance=case["utterance"], passed=passed,
            tool_called=tool_called, expected_tool=expected,
            response_text=text.strip(), reason=reason,
        )
```

Add eval route to `app.py`:

```python
@app.post("/api/eval")
async def eval_endpoint() -> StreamingResponse:
    from voicecal.eval import run_evals, EvalResult
    async def stream():
        total = passed = 0
        async for result in run_evals():
            total += 1
            if result.passed: passed += 1
            yield f"data: {json.dumps(asdict(result))}\n\n"
        yield f"data: {json.dumps({'type':'summary','total':total,'passed':passed})}\n\n"
        yield "data: [DONE]\n\n"
    return StreamingResponse(stream(), media_type="text/event-stream")
```

### 5.3 EvalPanel frontend

Create `frontend/src/components/EvalPanel.tsx`:

```tsx
import { useState } from "react";

type Result = {
  id: string;
  utterance: string;
  passed: boolean;
  expected_tool: string;
  tool_called: string | null;
  reason: string;
};

export function EvalPanel() {
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<Result[]>([]);
  const [running, setRunning] = useState(false);
  const [summary, setSummary] = useState<{
    total: number;
    passed: number;
  } | null>(null);

  async function run() {
    setResults([]);
    setSummary(null);
    setRunning(true);
    const res = await fetch("/api/eval", { method: "POST" });
    const reader = res.body!.getReader();
    const dec = new TextDecoder();
    let buf = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data: ") || line === "data: [DONE]") continue;
        const d = JSON.parse(line.slice(6));
        if (d.type === "summary") setSummary(d);
        else setResults((p) => [...p, d]);
      }
    }
    setRunning(false);
  }

  return (
    <div className="border-t border-zinc-800">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full py-2 text-xs text-zinc-500 hover:text-zinc-300"
      >
        {open ? "▲ Hide evals" : "▼ Run evals"}
      </button>
      {open && (
        <div className="p-4 space-y-3">
          <div className="flex items-center gap-4">
            {summary && (
              <span
                className={`text-sm font-mono font-bold
                ${summary.passed === summary.total ? "text-emerald-400" : "text-amber-400"}`}
              >
                {summary.passed}/{summary.total} passed
              </span>
            )}
            <button
              onClick={run}
              disabled={running}
              className="ml-auto bg-indigo-700 text-white text-xs rounded-lg px-3 py-1.5
                         hover:bg-indigo-600 disabled:opacity-40"
            >
              {running ? "Running…" : "Run all"}
            </button>
          </div>
          <div className="space-y-1 max-h-56 overflow-y-auto">
            {results.map((r) => (
              <div key={r.id} className="flex gap-2 text-xs font-mono">
                <span>{r.passed ? "✅" : "❌"}</span>
                <span className="text-zinc-400 truncate flex-1">
                  {r.utterance}
                </span>
                {!r.passed && (
                  <span className="text-red-400 shrink-0 text-right">
                    {r.reason}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

Add `<EvalPanel />` below `<ChatView />` in `App.tsx`.

### Phase 5 gate check

```
Click "Run all" in the eval panel.
→ Results stream in line by line
→ Summary shows N/20 passed with a colour indicator
→ Each row shows ✅ or ❌ with failure reason

Aim for ≥15/20. If below that, check tool descriptions in tools.py first.
```

---

## Phase 6 — polish and deploy (2 hours)

**Goal:** live at a public HTTPS URL, demo script runs cleanly end to end.

### 6.1 Polish (timebox 45 minutes total)

- Loading skeleton: a pulsing grey bar where the next assistant message will appear.
- `EventCard` component: if a tool result contains events, render them as cards (title, time, attendee chips) instead of raw JSON.
- Toast on API error: one `<div>` that appears for 3s on fetch failure.
- `<title>VoiceCal</title>` in `index.html`.
- Header status dot turns red if `/health` fails.

### 6.2 README

Must include:

- One-sentence description.
- Architecture diagram (take the mermaid from the production `ARCHITECTURE.md`, trim to just the demo slice — single service, Google Calendar, voice, RAG).
- Tech choices and **why**: Anthropic for tool-calling reliability, Whisper for accuracy, ChromaDB for zero-config vector search.
- What you would build next: Clerk, streaming voice, CalDAV, mobile PWA.
- Five-command quickstart.

### 6.3 Backend deploy

Use the platform covered in the bootcamp (Modal, Railway, Fly, Render). Set env vars:

```
ANTHROPIC_API_KEY=<real key>
OPENAI_API_KEY=<real key>
MOCK_PROVIDERS=false
USER_TIMEZONE=<your IANA timezone>
CORS_ORIGINS=https://your-frontend-url.vercel.app
GOOGLE_CREDENTIALS_PATH=token.json
```

For `token.json`: set its contents as a `GOOGLE_TOKEN_JSON` env var and read it in `calendar.py`:

```python
import os, json, tempfile

def _token_path() -> str:
    raw = os.environ.get("GOOGLE_TOKEN_JSON")
    if raw:
        f = tempfile.NamedTemporaryFile(suffix=".json", delete=False, mode="w")
        f.write(raw)
        f.flush()
        return f.name
    return settings.google_credentials_path
```

### 6.4 Frontend deploy

```bash
cd frontend
echo "VITE_API_URL=https://your-backend-url" > .env.production
pnpm build
# Deploy dist/ to Vercel: `vercel deploy`
```

In `lib/api.ts`, prefix all fetch calls with `import.meta.env.VITE_API_URL ?? ""`.

### 6.5 Final end-to-end check

Run the demo script from `demo-script.md` on the deployed URL in an incognito window:

1. "What's on my calendar this week?" → real events listed.
2. Voice: "Book 30 minutes with [name] on [day] at [time]" → created + audio.
3. Voice: "Move that to [different time]" → updated + audio.
4. Type: "When did I last meet with [real person]?" → RAG result.
5. Click Run all → evals stream, pass rate shows.

If any step fails: fix it if under 15 minutes, cut it from the demo script if not.

### Phase 6 gate check

```
Deployed URL opens in incognito.
All five demo scenarios complete without errors.
Record a Loom backup of this run now — open the tab before going to sleep.
```

---

## Cutdown table

If a phase is taking too long, use this:

| Phase behind           | Cut                                  | Keep                    |
| ---------------------- | ------------------------------------ | ----------------------- |
| Phase 1 > 4h           | Drop SSE streaming, return full JSON | Working agent + tools   |
| Phase 2 not working    | Use fixture events in mock mode      | Text chat working       |
| Phase 3 voice > 2h     | Cut voice entirely                   | Text + tools + evals    |
| Phase 4 RAG > 2h       | Cut RAG                              | Voice (or text) + evals |
| Phase 5 evals > 1h     | 5 manual cases run live              | Something runnable      |
| Phase 6 no deploy time | Demo from localhost on your laptop   | Everything running      |

A demo that works on fewer phases is better than one that crashes on all of them.

---

## Fill this in as you build

`demo-script.md` — the exact utterances you will use on stage:

```markdown
# VoiceCal demo script — 5 minutes

## 1. Text query (30s)

Type: "what's on my calendar this week?"

## 2. Voice create (45s)

Say: "book 30 minutes with [NAME] on [DAY] at [TIME]"

## 3. Voice reschedule (30s)

Say: "move that to [NEW TIME]"

## 4. RAG query (30s)

Type: "when did I last meet with [NAME]?"

## 5. Eval panel (60s)

Click Run all — narrate the pass rate

## 6. Architecture (60s)

Open README diagram — explain what you'd build next
```

---

## Final pre-demo checklist

- [ ] Fresh clone + `uv sync` + `pnpm install` works on demo laptop
- [ ] `.env` has real keys, `MOCK_PROVIDERS=false`
- [ ] Google OAuth token fresh (run `list_events` from terminal to confirm)
- [ ] Deployed URL opens in incognito, connects to backend
- [ ] HTTPS on deployed URL — mic permission works
- [ ] Demo script rehearsed end-to-end twice
- [ ] Loom backup recording ready in a browser tab
- [ ] Laptop charged, charger in bag, Wi-Fi tested
