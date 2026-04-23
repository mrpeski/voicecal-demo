"""Voice pipeline: bytes → Whisper → agent → TTS → bytes."""

from __future__ import annotations

import io

from openai import AsyncOpenAI

from voicecal.settings import settings

_client = AsyncOpenAI(api_key=settings.openai_api_key.get_secret_value())

# Maps browser MIME types to file extensions Whisper recognizes.
_EXT_BY_TYPE = {
    "audio/webm": ".webm",
    "audio/mp4": ".mp4",
    "audio/mpeg": ".mp3",
    "audio/wav": ".wav",
    "audio/x-wav": ".wav",
    "audio/ogg": ".ogg",
    "audio/flac": ".flac",
}


async def transcribe(audio_bytes: bytes, content_type: str = "audio/webm") -> str:
    # Strip codec suffix: "audio/webm;codecs=opus" → "audio/webm"
    base_type = content_type.split(";")[0].strip().lower()
    suffix = _EXT_BY_TYPE.get(base_type, ".webm")

    buf = io.BytesIO(audio_bytes)
    buf.name = f"audio{suffix}"  # SDK inspects .name to infer the extension

    resp = await _client.audio.transcriptions.create(
        model="whisper-1",
        file=buf,
    )
    return resp.text


async def synthesize(text: str) -> bytes:
    async with _client.audio.speech.with_streaming_response.create(
        model="tts-1",
        voice="alloy",
        input=text,
        response_format="mp3",
    ) as response:
        return await response.read()
