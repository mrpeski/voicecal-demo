import asyncio
import base64
from contextlib import asynccontextmanager
from datetime import datetime, timedelta
from uuid import uuid4
from zoneinfo import ZoneInfo

import structlog
from fastapi import Depends, FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, ConfigDict
from starlette.exceptions import HTTPException as StarletteHTTPException

from voicecal.agent import get_session, run_agent
from voicecal.agent.session_compaction import force_compact_session
from voicecal.agent.tools import fetch_events
from voicecal.api.dependencies import require_clerk_user_id
from voicecal.config.settings import settings
from voicecal.core.errors import AppError, PayloadTooLargeError
from voicecal.eval import stream_evals
from voicecal.guardrails import assert_user_text_allows, enforce_request_rate_limit
from voicecal.intent_classifier import require_in_scope_by_classifier
from voicecal.llm_use_guardrails import assert_voicecal_intended_use
from voicecal.rag import build_index
from voicecal.structured import build_stt_structured
from voicecal.voice import synthesize, transcribe

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

    # Build RAG index on startup. Don't fail startup if this errors —
    # the agent still works without RAG, just without history search.
    if not settings.mock_providers:
        try:
            n = await build_index()
            log.info("startup_rag_ready", indexed=n)
        except Exception:
            log.exception("startup_rag_failed")
    else:
        log.info("startup_rag_skipped", reason="mock_providers")

    if settings.mock_llm_flag_ignored:
        log.warning(
            "mock_llm_ignored",
            message="MOCK_LLM is set but MOCK_PROVIDERS is false; using the real LLM. "
            "Unset MOCK_LLM in production or set MOCK_PROVIDERS=true for full mock mode.",
        )

    yield


app = FastAPI(title="voicecal", lifespan=lifespan)


# 1. Exception handlers FIRST — every error path must return a real Response.
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
# Starlette rejects allow_credentials=True combined with allow_origins=["*"], so we
# disable credentials when the wildcard is in play. We don't use cookies anyway.
_cors_origins = settings.cors_origins
_allow_credentials = "*" not in _cors_origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=_allow_credentials,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "service": "voicecal"}


@app.get("/api/events")
async def get_events(
    time_min: str | None = None,
    time_max: str | None = None,
    _user_id: str = Depends(require_clerk_user_id),
) -> dict:
    """Return calendar events in a time window (defaults: 7 days ago → 30 days ahead)."""
    tz = ZoneInfo(settings.user_timezone)
    now = datetime.now(tz)
    start = time_min or (now - timedelta(days=7)).isoformat()
    end = time_max or (now + timedelta(days=30)).isoformat()
    events = await fetch_events(start, end)
    return {"events": events}


class ChatRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")
    message: str
    conversation_id: str | None = None  # None = start a new conversation


@app.post("/api/chat")
async def chat(
    request: Request,
    req: ChatRequest,
    _user_id: str = Depends(require_clerk_user_id),
) -> StreamingResponse:
    await enforce_request_rate_limit(request)
    assert_user_text_allows(req.message, label="message")
    assert_voicecal_intended_use(req.message)
    await require_in_scope_by_classifier(req.message)
    conversation_id = req.conversation_id or str(uuid4())

    async def stream():
        # Send the conversation_id first so the client can persist it
        # and send it back on subsequent turns.
        yield f'data: {{"type": "session", "conversation_id": "{conversation_id}"}}\n\n'

        async for event in run_agent(req.message, conversation_id):
            yield f"data: {event.model_dump_json()}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(stream(), media_type="text/event-stream")


@app.post("/api/eval")
async def eval_endpoint(
    request: Request,
    _user_id: str = Depends(require_clerk_user_id),
) -> StreamingResponse:
    """Stream the golden-set eval results, one SSE event per scenario state change."""
    await enforce_request_rate_limit(request)

    async def stream():
        async for event in stream_evals():
            yield f"data: {event.model_dump_json()}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(stream(), media_type="text/event-stream")


@app.post("/api/chat/{conversation_id}/clear")
async def clear_chat(
    conversation_id: str,
    _user_id: str = Depends(require_clerk_user_id),
) -> dict:
    session = get_session(conversation_id)
    await session.clear_session()
    return {"ok": True}


@app.post("/api/chat/{conversation_id}/compact")
async def compact_chat(
    conversation_id: str,
    _user_id: str = Depends(require_clerk_user_id),
) -> dict:
    session = get_session(conversation_id)
    result = await force_compact_session(session)
    return {
        "ok": True,
        "compacted": result.compacted,
        "message": result.message,
    }


@app.post("/api/voice")
async def voice_endpoint(
    request: Request,
    audio: UploadFile = File(...),
    conversation_id: str | None = Form(default=None),
    _user_id: str = Depends(require_clerk_user_id),
):
    await enforce_request_rate_limit(request)
    # 1. Validate input
    if not audio.content_type or not audio.content_type.startswith("audio/"):
        raise HTTPException(400, f"Expected audio/*, got {audio.content_type!r}")

    audio_bytes = await audio.read()
    if not audio_bytes:
        raise HTTPException(400, "Empty audio upload")
    if len(audio_bytes) > settings.max_voice_audio_bytes:
        raise PayloadTooLargeError("Audio file is too large.")

    # 2. STT
    try:
        transcript = await transcribe(audio_bytes, audio.content_type)
    except Exception as exc:
        import traceback

        traceback.print_exc()
        raise HTTPException(502, f"Transcription failed: {exc!r}") from exc

    if not transcript.strip():
        raise HTTPException(422, "No speech detected in audio")
    assert_user_text_allows(transcript, label="transcript")
    assert_voicecal_intended_use(transcript)
    await require_in_scope_by_classifier(transcript)

    # 3. Agent run — SQLiteSession handles history. STT structured parse runs
    # in parallel with the agent; it only needs the transcript.
    conv_id = conversation_id or str(uuid4())
    full_text = ""
    tool_calls: list[dict] = []
    structured_data: dict | None = None
    stt_task = asyncio.create_task(build_stt_structured(transcript))

    try:
        async for event in run_agent(transcript, conv_id):
            if event.type == "token":
                full_text += event.text
            elif event.type == "tool_call":
                tool_calls.append(event.model_dump())
            elif event.type == "structured":
                structured_data = event.data
    except Exception as exc:
        log.exception("agent_failed")
        stt_task.cancel()
        raise HTTPException(500, f"Agent run failed: {exc!r}") from exc

    stt_structured: dict | None = None
    try:
        stt_norm = await stt_task
        if stt_norm is not None:
            stt_structured = stt_norm.model_dump(mode="json")
    except asyncio.CancelledError:
        pass
    except Exception:
        log.exception("stt_structured_await_failed")

    response_text = full_text.strip()
    if not response_text:
        response_text = "Sorry, I didn't catch that."

    # 4. TTS
    try:
        audio_out = await synthesize(response_text)
    except Exception as exc:
        log.exception("tts_failed")
        raise HTTPException(502, f"Speech synthesis failed: {exc}") from exc

    return {
        "conversation_id": conv_id,
        "transcript": transcript,
        "response_text": response_text,
        "audio_base64": base64.b64encode(audio_out).decode(),
        "tool_calls": tool_calls,
        "structured_data": structured_data,
        "stt_structured": stt_structured,
    }


@app.post("/api/_debug/reindex")
async def reindex(
    force: bool = True,
    _user_id: str = Depends(require_clerk_user_id),
):
    n = await build_index(force=force)
    return {"indexed": n}


@app.post("/api/_debug/reset-rag")
async def reset_rag(_user_id: str = Depends(require_clerk_user_id)):
    from voicecal.rag import service as rag_svc

    rag_svc._chroma.delete_collection("calendar_history")
    rag_svc._col = rag_svc._chroma.get_or_create_collection("calendar_history")
    n = await build_index(force=True)
    return {"reindexed": n}
