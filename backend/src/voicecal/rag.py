"""RAG over calendar history.

Indexes the last 6 months of events at startup and exposes a search tool.
Uses a persistent Chroma collection so restarts don't re-embed everything.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

import chromadb
import structlog
from agents import function_tool
from openai import AsyncOpenAI

from voicecal.calendar import list_events as gcal_list_events
from voicecal.settings import settings

log = structlog.get_logger()

# Persist to disk next to sessions.db / token.json so restarts are cheap.
_CHROMA_DIR = Path(__file__).resolve().parents[2] / "chroma"
_CHROMA_DIR.mkdir(exist_ok=True)

_chroma = chromadb.PersistentClient(path=str(_CHROMA_DIR))
_col = _chroma.get_or_create_collection("calendar_history")

_openai = AsyncOpenAI(api_key=settings.openai_api_key.get_secret_value())

EMBED_MODEL = "text-embedding-3-small"
LOOKBACK_DAYS = 180


async def _embed(texts: list[str]) -> list[list[float]]:
    resp = await _openai.embeddings.create(model=EMBED_MODEL, input=texts)
    return [r.embedding for r in resp.data]


def _format_doc(ev: dict) -> tuple[str, dict]:
    title = ev.get("summary") or "Untitled"

    # Attendee names, not just emails — names are what users say.
    attendees_list = ev.get("attendees") or []
    attendee_names = []
    for a in attendees_list:
        name = a.get("displayName") or a.get("email", "").split("@")[0]
        if name:
            attendee_names.append(name)

    start_raw = (ev.get("start") or {}).get("dateTime") or ev.get("start", {}).get("date") or ""
    end_raw = (ev.get("end") or {}).get("dateTime") or ev.get("end", {}).get("date") or ""
    description = (ev.get("description") or "").strip()
    location = (ev.get("location") or "").strip()

    # Derive human-readable time context. "March 2026, Tuesday morning" is
    # more retrievable than "2026-03-12T09:00:00+00:00".
    time_context = ""
    if start_raw:
        try:
            dt = datetime.fromisoformat(start_raw.replace("Z", "+00:00"))
            # e.g. "March 2026 • Tuesday morning"
            part_of_day = "morning" if dt.hour < 12 else "afternoon" if dt.hour < 17 else "evening"
            time_context = f"{dt.strftime('%B %Y')} • {dt.strftime('%A')} {part_of_day}"
        except ValueError:
            pass

    # Put the most semantically meaningful info first.
    parts = [title]
    if attendee_names:
        parts.append(f"With: {', '.join(attendee_names)}")
    if time_context:
        parts.append(time_context)
    if location:
        parts.append(f"Location: {location}")
    if description:
        # Truncate — embeddings degrade on very long inputs, and you pay per token.
        parts.append(description[:500])

    doc = "\n".join(parts)

    meta = {
        "title": title,
        "start": start_raw,
        "end": end_raw,
        "attendees": ", ".join(a.get("email", "") for a in attendees_list if a.get("email")),
        "attendee_names": ", ".join(attendee_names),
        "location": location,
        # Store the doc itself in metadata for display; documents[] also has it.
    }
    return doc, meta


def _should_index(ev: dict) -> bool:
    # Skip declined events — they didn't happen from your perspective.
    for a in ev.get("attendees") or []:
        if a.get("self") and a.get("responseStatus") == "declined":
            return False

    # Skip all-day repeating blockers ("Out of office", "Focus time") if you don't want them.
    # Tune this to your calendar — for some users these are the most important events.
    title = (ev.get("summary") or "").lower()
    if title in {"busy", "focus time", "out of office", "ooo"}:
        return False

    # Skip events you organized with only yourself — usually self-reminders.
    attendees = ev.get("attendees") or []
    if len(attendees) == 1 and attendees[0].get("self"):
        return False

    return True


async def build_index(force: bool = False) -> int:
    """Embed and upsert recent events.

    Args:
        force: If True, rebuild even when the collection is already populated.
               Otherwise, only index events that aren't already present.
    """
    existing_count = _col.count()
    if existing_count > 0 and not force:
        log.info("rag_build_index_skipped", existing=existing_count)
        return existing_count

    tz = ZoneInfo(settings.user_timezone)
    now = datetime.now(tz)

    events = await gcal_list_events(
        (now - timedelta(days=LOOKBACK_DAYS)).isoformat(),
        now.isoformat(),
    )
    if not events:
        log.info("rag_build_index", indexed=0, reason="no_events")
        return 0

    # Skip ids already indexed — Chroma's .get(ids=...) returns only those that exist.
    existing_ids = set(_col.get(ids=[e["id"] for e in events]).get("ids", []))

    new_events = [e for e in events if e["id"] not in existing_ids]
    new_events = [e for e in new_events if _should_index(e)]

    if not new_events:
        log.info("rag_build_index", indexed=0, skipped=len(events), reason="all_current")
        return 0

    docs, ids, metas = [], [], []
    for ev in new_events:
        doc, meta = _format_doc(ev)
        docs.append(doc)
        ids.append(ev["id"])
        metas.append(meta)

    try:
        embeddings = await _embed(docs)
    except Exception:
        log.exception("rag_embed_failed", count=len(docs))
        return 0

    _col.upsert(ids=ids, embeddings=embeddings, documents=docs, metadatas=metas)
    log.info("rag_build_index", indexed=len(docs), skipped=len(existing_ids))
    return len(docs)


async def search(query: str, top_k: int = 5) -> list[dict]:
    count = _col.count()
    if count == 0:
        return []

    q_emb = (await _embed([query]))[0]
    results = _col.query(
        query_embeddings=[q_emb],
        n_results=min(top_k, count),
    )
    return [
        {"text": doc, "metadata": meta}
        for doc, meta in zip(results["documents"][0], results["metadatas"][0])
    ]
