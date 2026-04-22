from contextlib import asynccontextmanager
from uuid import uuid4

import structlog
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, ConfigDict
from starlette.exceptions import HTTPException as StarletteHTTPException

from voicecal.agent import get_session, run_agent
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
