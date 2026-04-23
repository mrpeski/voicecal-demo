import base64
from contextlib import asynccontextmanager
from uuid import uuid4

import structlog
from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, ConfigDict
from starlette.exceptions import HTTPException as StarletteHTTPException

from voicecal.agent import TokenEvent, ToolCallEvent, get_session, run_agent
from voicecal.errors import AppError
from voicecal.rag import build_index
from voicecal.settings import settings
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


class ChatRequest(BaseModel):
    message: str
    conversation_id: str | None = None  # None = start a new conversation


@app.post("/api/chat")
async def chat(req: ChatRequest) -> StreamingResponse:
    conversation_id = req.conversation_id or str(uuid4())

    async def stream():
        # Send the conversation_id first so the client can persist it
        # and send it back on subsequent turns.
        yield f'data: {{"type": "session", "conversation_id": "{conversation_id}"}}\n\n'

        async for event in run_agent(req.message, conversation_id):
            yield f"data: {event.model_dump_json()}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(stream(), media_type="text/event-stream")


@app.post("/api/chat/{conversation_id}/clear")
async def clear_chat(conversation_id: str) -> dict:
    session = get_session(conversation_id)
    await session.clear_session()
    return {"ok": True}


@app.post("/api/voice")
async def voice_endpoint(
    audio: UploadFile = File(...),
    conversation_id: str | None = Form(default=None),
):
    # 1. Validate input
    if not audio.content_type or not audio.content_type.startswith("audio/"):
        raise HTTPException(400, f"Expected audio/*, got {audio.content_type!r}")

    audio_bytes = await audio.read()
    if not audio_bytes:
        raise HTTPException(400, "Empty audio upload")

    # 2. STT
    try:
        transcript = await transcribe(audio_bytes, audio.content_type)
    except Exception as exc:
        import traceback

        traceback.print_exc()
        raise HTTPException(502, f"Transcription failed: {exc!r}") from exc

    if not transcript.strip():
        raise HTTPException(422, "No speech detected in audio")

    # 3. Agent run — SQLiteSession handles history
    conv_id = conversation_id or str(uuid4())
    full_text = ""
    tool_calls: list[dict] = []

    try:
        async for event in run_agent(transcript, conv_id):
            if event.type == "token":
                full_text += event.text
            elif event.type == "tool_call":
                tool_calls.append(event.model_dump())
            # DoneEvent: ignore
    except Exception as exc:
        log.exception("agent_failed")
        raise HTTPException(500, f"Agent run failed: {exc}") from exc

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
    }


@app.post("/api/_debug/reindex")
async def reindex(force: bool = True):
    n = await build_index(force=force)
    return {"indexed": n}


@app.post("/api/_debug/reset-rag")
async def reset_rag():
    from voicecal.rag import _chroma, _col

    _chroma.delete_collection("calendar_history")
    # Re-create so subsequent calls work
    global _col
    _col = _chroma.get_or_create_collection("calendar_history")
    n = await build_index(force=True)
    return {"reindexed": n}
