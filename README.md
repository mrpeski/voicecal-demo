# VoiceCal Demo

VoiceCal is a demo calendar assistant that supports typed chat, voice input/output, tool-calling for calendar actions, and a live eval panel.

## Architecture

- `frontend/`: Vite + React + TypeScript SPA.
- `backend/`: FastAPI service with SSE streaming, tool orchestration, voice endpoints, and eval harness.
- `eval/golden.jsonl`: golden scenarios for deterministic-ish grading runs.

```text
Browser (React)
  ├─ POST /api/chat (SSE token + tool stream)
  ├─ POST /api/voice (audio -> STT -> agent -> TTS)
  └─ POST /api/eval (SSE eval progress)
        ↓
FastAPI (agent loop + tools + errors)
  ├─ Google Calendar tool calls
  ├─ RAG search over indexed event history
  └─ Eval harness against golden scenarios
```

### Mermaid diagrams

Render these in GitHub, VS Code, or [mermaid.live](https://mermaid.live).

#### System context

```mermaid
flowchart LR
  subgraph Browser
    UI["App / chat / voice / eval"]
  end
  subgraph Proxy
    P["/api/* → backend"]
  end
  subgraph API
    R["FastAPI: voicecal.api.main"]
  end
  subgraph Agent
    RA["run_agent in agent/runner.py"]
    SS["SQLiteSession (sessions.db)"]
    OA["OpenAI Runner.run_streamed + tools"]
  end
  subgraph Tools
    T1["list / create / update events"]
    T2["search_calendar_history → RAG"]
  end
  subgraph Cal
    CP["get_calendar_provider() (Google or mock)"]
  end
  subgraph Voice
    STT[transcribe]
    TTS[synthesize]
  end
  subgraph RAG
    BI["build_index (startup + debug reindex)"]
  end
  UI --> P --> R
  R -->|SSE /api/chat| RA
  R -->|POST /api/voice| STT
  STT --> RA
  RA --> T1 --> CP
  RA --> T2 --> RAG
  RA --- SS
  RA --- OA
  R -->|SSE /api/eval| EVAL[stream_evals]
  R --> TTS
  BI --> RAG
```

#### POST /api/chat (SSE)

```mermaid
sequenceDiagram
  participant F as Frontend
  participant A as POST /api/chat
  participant G as guardrails
  participant R as run_agent
  participant S as SQLiteSession
  participant O as Runner.run_streamed
  participant T as calendar tools
  F->>A: JSON message + optional conversation_id
  A->>G: validate
  A-->>F: SSE session + conversation_id
  A->>R: message, conversation_id
  R->>S: load and persist history
  R->>O: user turn
  loop stream_events
    O-->>R: text deltas, tool calls
    R-->>A: token, tool_call, AgentEvents
    A-->>F: data line SSE
    O->>T: tool execution when model calls
  end
  R-->>A: optional structured plus done
  A-->>F: DONE sentinel line
```

#### POST /api/voice (JSON response)

```mermaid
sequenceDiagram
  participant F as Frontend
  participant V as POST /api/voice
  participant STT as transcribe
  participant R as run_agent
  participant T as build_stt_structured
  participant SYN as synthesize
  F->>V: multipart audio + optional conversation_id
  V->>STT: audio bytes
  STT-->>V: transcript
  par agent path
    V->>R: transcript, conv id
    R-->>V: token, tool_call, structured
  and STT structured
    V->>T: transcript
    T-->>V: stt_structured
  end
  V->>SYN: final response text
  SYN-->>V: audio bytes
  V-->>F: JSON transcript, response_text, base64 audio, tool_calls, …
```

#### Inside run_agent (simplified)

```mermaid
flowchart TD
  A[run_agent message, conversation_id] --> B{MOCK deterministic LLM?}
  B -->|yes| M[Echo tokens + demo structured + done]
  B -->|no| C[maybe_compact_session]
  C --> D["trace + Runner.run_streamed"]
  D --> E[Map SDK events to Token / ToolCall]
  E --> F[run_mock_provider_heuristic_recovery]
  F --> G{structured outputs on?}
  G -->|yes| H[build_structured_demo_bundle to Structured]
  G -->|no| I[skip]
  H --> J[DoneEvent]
  I --> J
```

## Local Run

### Backend

```bash
cd backend
uv sync
cp .env.example .env
uv run uvicorn voicecal.app:app --reload --port 8000
```

### Frontend

```bash
cd frontend
pnpm install
pnpm dev
```

## Checks

```bash
cd backend
uv run ruff check .
uv run pytest
uv run python -m voicecal.eval

cd ../frontend
pnpm build
```

## Demo Flow

1. Ask: "what's on my calendar this week?"
2. Voice: "book 30 minutes with Alex Friday afternoon"
3. Reschedule: "move that to Tuesday at 10"
4. Ask: "when did I last meet with Sarah?"
5. Open eval panel and run all scenarios.
