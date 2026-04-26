"""Pydantic shapes for OpenAI Chat Completions **structured output** (JSON / parse API).

Each section maps to a demo affordance: chips, planning cards, conflict badges, etc.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class CalendarChip(BaseModel):
    """Chip for a suggested or referenced time block in the user’s week."""

    model_config = ConfigDict(extra="forbid")

    label: str = Field(description="Short label, e.g. 'Deep work' or '1:1'")
    start_iso: str = Field(description="Start in ISO-8601 with offset or Z")
    end_iso: str = Field(description="End in ISO-8601 with offset or Z")
    kind: Literal["meeting", "focus", "personal", "admin", "other"] = "other"
    confidence: float = Field(
        0.8, ge=0, le=1, description="Model confidence that this is a good fit"
    )


class ConflictItem(BaseModel):
    """Conflict / overload the UI can badge."""

    model_config = ConfigDict(extra="forbid")

    severity: Literal["low", "medium", "high"] = "low"
    reason: str
    affected_event_ids: list[str] = Field(
        default_factory=list, description="Google event ids if known, else empty"
    )


class WeeklyPlanSection(BaseModel):
    """Narrated planning blocks (e.g. Monday 1h workflow, ‘plan my week’)."""

    model_config = ConfigDict(extra="forbid")

    last_week_read: str = Field(
        "", description="One short paragraph: how last week looked in the calendar"
    )
    this_week_headline: str = Field(
        "", description="One line summary of the week ahead, if applicable"
    )
    goal_alignment: list[str] = Field(
        default_factory=list, description="Bullets tying user-stated goals to the calendar"
    )
    recommended_actions: list[str] = Field(
        default_factory=list, max_length=6, description="Actionable next steps (max 6)"
    )


class ClarificationIntent(BaseModel):
    """Drives a small state-machine style UI (what to ask next)."""

    model_config = ConfigDict(extra="forbid")

    kind: Literal[
        "ask_goals",
        "confirm_create_block",
        "request_time_preference",
        "request_event_picker",
        "none",
    ] = "none"
    user_visible_prompt: str = Field("", description="If not none, short line to show in a banner")
    data: dict[str, str] = Field(
        default_factory=dict, description="Optional key/value hints, e.g. default_time"
    )


class EvalTraceView(BaseModel):
    """Read-only “what the agent thought” for demos / evals (not a substitute for real logs)."""

    model_config = ConfigDict(extra="forbid")

    intent: str = ""
    tool_to_call: str = ""
    args_preview: str = ""
    policy_flags: list[str] = Field(
        default_factory=list,
        description="e.g. in_scope, calendar_cue, short_follow_up",
    )


class StructuredDemoBundle(BaseModel):
    """One structured response the UI can render as chips, badges, and sections."""

    model_config = ConfigDict(extra="forbid")

    calendar_chips: list[CalendarChip] = Field(
        default_factory=list, max_length=8, description="Up to 8 time chips to render"
    )
    weekly_plan: WeeklyPlanSection = Field(
        default_factory=WeeklyPlanSection, description="Weekly planning narrative"
    )
    conflicts: list[ConflictItem] = Field(
        default_factory=list, description="Overlaps, overload, risky back-to-backs"
    )
    clarification: ClarificationIntent = Field(
        default_factory=ClarificationIntent,
        description="Clarification / follow-up the UI can highlight",
    )
    eval_trace: EvalTraceView = Field(
        default_factory=EvalTraceView,
        description="Lightweight eval-oriented summary of intent + tool",
    )


class SttNormalization(BaseModel):
    """Structured read of raw STT (voice); separate parse from the main agent bundle."""

    model_config = ConfigDict(extra="forbid")

    normalized_intent: str = Field(
        description="What the user seems to want in one calendar-focused sentence"
    )
    date_refs_resolved: list[str] = Field(
        default_factory=list,
        description="ISO-8601 datetimes or dates when inferable, else same as user said",
    )
    duration_minutes: int | None = Field(None, description="Inferred meeting/block length")
    attendee_names: list[str] = Field(default_factory=list, description="People mentioned")
    needs_clarification: bool = False
