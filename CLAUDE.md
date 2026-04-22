# AGENTS.md

Guidance for AI coding agents working on **VoiceCal** — a 48-hour bootcamp capstone demonstrating agentic LLM tool use, voice I/O, RAG, and evals against a real Google Calendar.

**This is a demo, not a product.** Optimize for a working live demo and a clean code review. Skip anything that doesn't show up on stage or in a README.

If you are about to reach for a "production-grade" abstraction — microservices, durable queues, auth providers, service workers — stop and check this file. The answer is almost always "no, not for this demo."

---

## What we're building

A single-process FastAPI backend + Vite React frontend that:

1. Connects to the developer's real Google Calendar via a pre-authorized OAuth token.
2. Runs a chat loop where the LLM calls typed tools (`list_events`, `create_event`, `update_event`, `search_calendar_history`).
3. Supports push-to-talk voice: browser records audio, backend transcribes with Whisper, runs the agent, synthesizes TTS, plays it back.
4. Uses RAG over past calendar events for questions like "when did I last meet with Alex?"
5. Has a live-runnable eval harness with ~20 golden-set scenarios.

Demo flow is ~5 minutes: voice interaction, show tool calls inline, run the evals live, wrap with the architecture slide.

---

## Hard scope limits

These are **not** part of the demo. Do not build them. If you find yourself building them, stop.

- No microservices. One backend service. One frontend app.
- No Clerk or real auth. A single hardcoded user id in the backend.
- No PWA, service worker, or offline mode. Plain SPA.
- No CalDAV or iCloud. Google Calendar only.
- No durable queue (Redis, Celery, arq). Synchronous handlers only.
- No Docker, no Nginx, no k3s. Vite dev server + `uvicorn --reload`.
- No database. In-memory Python dicts and an on-disk Chroma/FAISS index for RAG are enough.
- No workspace split, no `uv` multi-package workspace. One `pyproject.toml` in `backend/`.
- No conversation memory persistence across sessions. Keep history in the React component state.
- No LangChain, LlamaIndex, or agent frameworks. Use the LLM SDK's native tool-calling directly.

When in doubt: does a demo-day reviewer ever see or hear about this feature? If no, cut it.

---

## Repo layout

```
voicecal-demo/
├── AGENTS.md                   — this file
├── README.md                   — architecture + how-to-run
├── backend/
│   ├── pyproject.toml
│   ├── .env.example
│   ├── .env                    — gitignored
│   ├── token.json              — gitignored; Google OAuth token
│   └── src/voicecal/
│       ├── __init__.py
│       ├── app.py              — FastAPI app, middleware, routes
│       ├── settings.py         — pydantic-settings
│       ├── agent.py            — LLM + tool loop
│       ├── tools.py            — typed tool definitions
│       ├── calendar.py         — Google Calendar client
│       ├── voice.py            — Whisper STT + TTS
│       ├── rag.py              — embeddings + vector search over past events
│       ├── eval.py             — golden-set runner
│       └── errors.py           — typed AppError hierarchy
├── frontend/
│   ├── package.json
│   ├── vite.config.ts
│   ├── tsconfig.json
│   ├── index.html
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── components/
│       │   ├── ChatView.tsx
│       │   ├── MessageBubble.tsx
│       │   ├── ToolCall.tsx
│       │   ├── EventCard.tsx
│       │   ├── VoiceButton.tsx
│       │   └── EvalPanel.tsx
│       ├── lib/
│       │   ├── api.ts          — fetch wrapper + SSE client
│       │   └── types.ts        — TS mirrors of backend Pydantic types
│       └── styles.css          — Tailwind entry
├── eval/
│   └── golden.jsonl
└── demo-script.md              — the 5-minute live flow, rehearsed
```

One backend. One frontend. Two folders. Don't add more top-level directories unless something genuinely doesn't fit.

---

## Stack

**Backend:**
- Python 3.12, `uv` for dep management
- FastAPI + Uvicorn (with `--reload`)
- Anthropic SDK (`anthropic`) for the LLM — Claude's tool-calling is the most reliable
- `google-api-python-client` + `google-auth-oauthlib` for Google Calendar
- `openai` SDK for Whisper (STT) and TTS
- `chromadb` (or a pickled NumPy array — whichever is faster to set up) for RAG
- Pydantic v2 for all schemas
- `structlog` for logging

**Frontend:**
- Vite + React 18 + TypeScript (strict)
- Tailwind CSS (no component library — plain Tailwind is fast and reliable for a demo)
- Plain `fetch` + `EventSource` for SSE. No TanStack Query, no Zustand, no Redux.
- `framer-motion` only if you have spare time at the end for animations

**What you are NOT using:**
- LangChain, LlamaIndex, CrewAI, any agent framework
- shadcn/ui, Radix, Chakra, MUI (Tailwind alone is enough)
- TanStack Query, Zustand, Redux
- React Router (single-page app, no routes needed)

---

## Dev commands

From the repo root:

```bash
# Backend — first time
cd backend && uv sync && cp .env.example .env   # fill in API keys
# then from backend/
uv run uvicorn voicecal.app:app --reload --port 8000

# Frontend — first time
cd frontend && pnpm install
# then
pnpm dev                                          # :5173, proxies /api to :8000

# Tests (backend)
cd backend && uv run pytest

# Evals (backend) — runnable standalone AND via /api/eval endpoint
cd backend && uv run python -m voicecal.eval

# Format/lint
uv run ruff format . && uv run ruff check .
```

Vite's dev server proxies `/api/*` to `http://localhost:8000`. Configured in `vite.config.ts`. Never hit the backend directly from the browser — always through the proxy — so CORS issues can't bite you on stage.

---

## Architectural rules (the load-bearing ones)

Even for a 48-hour demo, these are non-negotiable.

### 1. Every endpoint is `async def`

No sync handlers. `openai`, `anthropic`, `httpx`, and `google-api-python-client` all have async paths (or can be wrapped with `asyncio.to_thread` for the one that doesn't).

### 2. FastAPI middleware ordering — do not get this wrong

The demo-killing bug is the false CORS error: an unhandled exception in a handler bypasses CORS and the browser reports "CORS error" while the real error is invisible. **You will be debugging on stage if this happens.**

Every FastAPI app **must** be constructed as follows, in this order:

```python
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException
from voicecal.errors import AppError

app = FastAPI(title="voicecal")

# 1. Exception handlers FIRST — every error path must produce a real Response.
@app.exception_handler(AppError)
async def _app_error(request: Request, exc: AppError):
    return JSONResponse(status_code=exc.status_code,
                        content={"error": {"code": exc.code, "message": exc.message}})

@app.exception_handler(StarletteHTTPException)
async def _http_error(request: Request, exc: StarletteHTTPException):
    return JSONResponse(status_code=exc.status_code,
                        content={"error": {"code": "http_error", "message": str(exc.detail)}})

@app.exception_handler(Exception)
async def _fallback(request: Request, exc: Exception):
    log.exception("unhandled", path=request.url.path)
    return JSONResponse(status_code=500,
                        content={"error": {"code": "internal_error",
                                           "message": "Internal server error"}})

# 2. CORS middleware LAST — it is the OUTERMOST layer, so it wraps the handlers above.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

All three exception handlers are required. The fallback `Exception` handler is what saves your demo.

### 3. Tools are typed, validated, and strict

Every tool has:

- A Pydantic input model with `model_config = ConfigDict(extra="forbid")`.
- `Field(..., description="...")` on every field — the descriptions are sent to the LLM.
- A handler that validates input and returns a typed output model.
- The `description` on the tool itself is what the LLM reads to decide when to call it. Write it well.

### 4. Timezones are explicit, always

Every `datetime` carries tz info. Use `zoneinfo.ZoneInfo(user_timezone)`, never naive datetimes. Google Calendar's API defaults to the *calendar's* timezone, not the user's — always pass `timeZone` explicitly on create/update.

Hardcode the user's timezone in settings for the demo. Don't try to detect it from the browser.

### 5. The LLM is untrusted

Even for a demo:

- Schema-validate every tool argument before executing.
- Never let the LLM invent event IDs. If a tool says "update event X," the agent first calls `list_events` or `find_event` to get a real ID.
- Don't put API keys or the raw Google token in prompts.

### 6. Stream tokens

The `/api/chat` endpoint is SSE. Tokens stream back to the browser as the LLM generates them. Tool calls are streamed as structured events too, so the frontend can render them inline as the agent thinks.

This is the single biggest visual-polish win for the demo. Do not skip it.

---

## Demo flow — the thing you're actually building

This is what runs live. If a feature isn't on this list, you don't need it.

1. **Text chat** — user types "what's on my calendar this week?" → agent calls `list_events` → result shown as `EventCard` components in the chat.
2. **Voice chat** — user holds the mic button and says "book 30 minutes with Alex Friday afternoon" → response plays back as audio with the transcript visible.
3. **Reschedule** — user says "actually move that to Tuesday at 10" → agent resolves the ambiguity with the previous turn's event, calls `update_event`, confirms.
4. **RAG query** — user asks "when did I last meet with Sarah?" → agent calls `search_calendar_history` → retrieves from embeddings → synthesizes the answer.
5. **Eval panel** — click "Run evals" button → 20 scenarios run in ~60 seconds → pass/fail rendered live. This is the hedge against flaky live demos and the curriculum-aligned moment.
6. **Architecture slide** — one slide explaining the agent loop, the RAG pipeline, and what you'd build next.

---

## Frontend conventions

### Components

- **`ChatView`** — scrollable message list plus input. Handles SSE connection for `/api/chat`. Appends streaming tokens to the last assistant message.
- **`MessageBubble`** — one chat message. User or assistant. Assistant bubbles can contain streaming text, tool call indicators, and event cards.
- **`ToolCall`** — rendered inline in an assistant message when the agent invokes a tool. Shows `🔧 Calling create_event...` while running, `✓ Created: Coffee with Alex, Fri 3pm` when done. This is what makes the demo look like you built something real.
- **`EventCard`** — a calendar event rendered as a card: title, time range in the user's timezone, attendees. Use it whenever the agent returns structured event data.
- **`VoiceButton`** — big button at the bottom of the chat. `onMouseDown` / `onTouchStart` starts `MediaRecorder`; `onMouseUp` / `onTouchEnd` sends the blob to `/api/voice`. Show a pulsing red dot while recording.
- **`EvalPanel`** — a toggleable panel showing golden-set scenarios and their pass/fail state. Has a "Run all" button that POSTs `/api/eval` and streams results.

### Rules

- **TypeScript strict.** No `any`. Types mirror backend Pydantic models in `lib/types.ts` — hand-maintained for the demo (20 lines), not codegen.
- **Plain React state with `useState` / `useReducer`.** No TanStack Query, no Zustand.
- **Tailwind only.** No shadcn, no Radix. Dark mode background (`bg-zinc-900`), zinc/indigo accent palette. Looks great on projectors.
- **One CSS file** — `src/styles.css` with the Tailwind `@import`s.
- **All API calls go through `lib/api.ts`.** One `apiFetch()` helper, one `apiStream()` helper for SSE. No `fetch()` calls in components.
- **Loading and error states are mandatory.** Never render a bare spinner — render a skeleton. Never silently swallow a fetch error — render a toast. Both matter during live demo when something fails.

---

## Backend conventions

### Agent loop

`agent.py` runs the tool-calling loop. Shape:

```python
async def run_agent(user_message: str, history: list[Message]) -> AsyncIterator[AgentEvent]:
    """Yields events: token | tool_call_start | tool_call_result | done."""
    ...
```

Events are Pydantic models; the app layer serializes them to SSE `data:` lines. The frontend reconstructs the conversation from the event stream.

Tool-calling uses the Anthropic SDK's native `tools` parameter. Loop until the model stops emitting tool calls. Max 6 iterations — if you hit that, something is wrong (likely the model chasing its tail); yield an error event.

### Tools

Four tools total:

- `list_events(time_range_start, time_range_end)` → list of events
- `create_event(title, start, end, attendees?, description?)` → created event
- `update_event(event_id, changes)` → updated event
- `search_calendar_history(query, top_k=5)` → list of past events semantically similar to `query`

Each tool file exports: an input model, an output model, a handler, and a registration helper that returns the Anthropic tool spec. All four are registered in `tools.py`; `agent.py` imports the registry.

### Google Calendar client

- Load OAuth token from `backend/token.json` at startup. If missing, print instructions to run a one-shot `scripts/auth.py` that does the OAuth dance locally and writes the token.
- Wrap the sync Google API client in `asyncio.to_thread()` for the demo — don't fight the lack of native async.
- Cache calendar list and the primary calendar id at startup. Don't re-fetch per request.

### Voice

- `POST /api/voice` accepts `multipart/form-data` with a `webm` or `mp4` audio blob.
- Transcribe with `openai.audio.transcriptions.create(model="whisper-1", file=...)`.
- Pass the transcript through the *same* agent loop as `/api/chat`.
- Synthesize the final text response with `openai.audio.speech.create(model="tts-1", voice="alloy", input=...)`. Return base64-encoded MP3 in the response JSON along with the transcript and final text.
- Frontend plays the audio and shows the transcript + response text.

Don't stream voice. Record-then-send is fine for 48 hours.

### RAG

- On startup: fetch the last 6 months of events from Google Calendar.
- For each event, embed `f"{title} — {', '.join(attendees)} — {description}"` with `text-embedding-3-small`.
- Store in ChromaDB with the event id + start datetime as metadata.
- `search_calendar_history(query)` embeds the query, retrieves top K by cosine similarity, returns the results.
- Refresh the index lazily: expose an `/api/rag/refresh` button you can click before the demo to make sure it's fresh.

### Eval harness

- `eval/golden.jsonl`: 20 lines. Each: `{utterance, expected_tool, expected_args_contains, final_state_check}`.
- `backend/src/voicecal/eval.py` exports `run_evals() -> list[EvalResult]`. Reuses the agent loop against a fresh in-memory Google Calendar mock (not real Google — the eval must be deterministic and fast).
- Also exposed as `POST /api/eval` that streams results via SSE.
- The frontend `EvalPanel` renders each scenario's state (running → pass/fail) in real time. Big pass-rate number at the top.

---

## Error handling

- Backend: one typed `AppError` hierarchy in `errors.py` (`AppError`, `ValidationError`, `NotFoundError`, `ProviderError`, `ToolError`). Raise these; the exception handlers in `app.py` format them.
- Never return `{"error": "something went wrong"}`. Always `{"error": {"code": "...", "message": "..."}}`.
- Frontend: `lib/api.ts` parses the error envelope and throws a typed `ApiError`. Components show a toast on catch. Never swallow errors silently — a silent failure on stage is worse than a visible one.

---

## Pre-demo checklist

Twelve hours before demo, work through this:

- [ ] `uv sync` + `pnpm install` from a fresh clone on your actual demo laptop.
- [ ] `.env` has real API keys for Anthropic, OpenAI, and Google. Not dev placeholders.
- [ ] `token.json` is present and the OAuth token hasn't expired. Open `list_events` to confirm.
- [ ] Frontend deployed somewhere (Vercel for the frontend, Modal/Railway/Fly for the backend). Have a URL to share after the demo.
- [ ] Browser mic permission is pre-granted for your deployed domain.
- [ ] `demo-script.md` has your 5-minute flow written out, with exact utterances, in order.
- [ ] Ran the script end-to-end twice without looking at notes.
- [ ] **Recorded a backup video** of the full demo flow. Have it open in a tab. If anything fails live, you pivot to the video without losing the room.
- [ ] Laptop on charge. Wi-fi tested. Charger in the bag.
- [ ] A second calendar prepared with "good" events to demo against (meetings with attendees, varied times).

---

## Pre-commit sanity

Before you `git push`:

- `uv run ruff format . && uv run ruff check .`
- `uv run pytest` — tests pass
- `pnpm build` in the frontend — production build succeeds
- Run the demo script locally against real Google Calendar — still works

---

## Gotchas you will hit

- **CORS errors that mask real exceptions.** Three exception handlers in exact order, CORS added last. Covered above — don't skip it.
- **Google Calendar OAuth token expiry.** Test in the morning before the demo. Refresh if needed.
- **`MediaRecorder` in Safari.** Safari has spotty support and different default mime types. Demo in Chrome. If you must support Safari, force `audio/mp4` mime type; Whisper accepts it.
- **Microphone requires HTTPS.** Localhost is fine for dev. Your deployed URL must be HTTPS — Vercel/Netlify give you this for free.
- **Whisper rejects tiny audio blobs.** If a recording is under ~0.5s, it returns empty text. Add a minimum-duration check in `VoiceButton` (e.g. require 500ms hold before actually submitting).
- **Anthropic tool-use loop not terminating.** If the model keeps calling tools, your tool descriptions are probably bad. Tighten them. Add a hard iteration cap (6).
- **Streaming tokens buffer in fetch.** `EventSource` handles SSE correctly; `fetch` + `ReadableStream` needs `response.body.getReader()` and manual parsing. Use `EventSource` for GET SSE; for POST SSE (which the Anthropic-style chat wants), use `fetch` with `Accept: text/event-stream` and parse chunks manually. The `api.ts` wrapper hides this.
- **Timezone surprises.** Google returns events in the calendar's timezone; the LLM reasons best in the user's timezone. Always convert at the boundary.
- **Tailwind classes not applying after install.** The `content` paths in `tailwind.config.js` must include your `src/**/*.tsx` glob. Check first.

---

## If you fall behind

These are the kill switches, in order:

1. **Behind at Monday noon** (text chat doesn't work yet). Simplify the LLM integration. Use `litellm` or the simplest example from the provider's docs. Do not start debugging until text works.
2. **Behind at Monday evening** (Google Calendar not working). Skip OAuth. Use a service account or the simplest flow. Or: hardcode a calendar with fixture events and demo against that — explain in the README that OAuth is "out of scope for the demo slice."
3. **Behind at Tuesday morning** (voice not working after 2 hours). **Cut voice entirely.** A great text demo beats a broken voice demo. Move the time into evals and polish.
4. **Behind at Tuesday noon** (RAG not working). Cut RAG. A well-executed tool-calling demo with evals is already strong. Don't bolt on a broken RAG at the last minute.
5. **Behind at Tuesday afternoon** (can't deploy). Demo from localhost. Screen-share from your laptop. It's fine.

**The line you don't cross:** no new features after Tuesday 4pm. Anything not working at 4pm is cut. You spend the last two hours rehearsing, not building.

---

## When in doubt

- Check the demo flow above. Does this change help one of the six demo moments? If no, skip it.
- Check the hard scope limits. Are you drifting into microservices, auth, or offline territory? Stop.
- Default to "simpler and working" over "cleaner and half-done."
- If something takes longer than its time budget, cut it. Velocity matters more than architecture for the next 48 hours.
