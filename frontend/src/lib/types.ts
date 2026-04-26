export type TokenEvent = { type: "token"; text: string };
export type ToolCallEvent = {
  type: "tool_call";
  name: string;
  status: "running" | "done" | "error";
  result?: string;
};
export type SessionEvent = {
  type: "session";
  conversation_id: string;
};

/** Backend `StructuredEvent` / OpenAI `StructuredDemoBundle` JSON. */
export interface CalendarChipT {
  label: string;
  start_iso: string;
  end_iso: string;
  kind: "meeting" | "focus" | "personal" | "admin" | "other";
  confidence: number;
}

export interface ConflictItemT {
  severity: "low" | "medium" | "high";
  reason: string;
  affected_event_ids: string[];
}

export interface WeeklyPlanSectionT {
  last_week_read: string;
  this_week_headline: string;
  goal_alignment: string[];
  recommended_actions: string[];
}

export type ClarificationKindT =
  | "ask_goals"
  | "confirm_create_block"
  | "request_time_preference"
  | "request_event_picker"
  | "none";

export interface ClarificationIntentT {
  kind: ClarificationKindT;
  user_visible_prompt: string;
  data: Record<string, string>;
}

export interface EvalTraceViewT {
  intent: string;
  tool_to_call: string;
  args_preview: string;
  policy_flags: string[];
}

export interface StructuredDemoData {
  calendar_chips: CalendarChipT[];
  weekly_plan: WeeklyPlanSectionT;
  conflicts: ConflictItemT[];
  clarification: ClarificationIntentT;
  eval_trace: EvalTraceViewT;
}

export type StructuredSseEvent = { type: "structured"; data: StructuredDemoData };

export type SttNormalizationT = {
  normalized_intent: string;
  date_refs_resolved: string[];
  duration_minutes: number | null;
  attendee_names: string[];
  needs_clarification: boolean;
};

export type StreamEvent =
  | TokenEvent
  | ToolCallEvent
  | SessionEvent
  | StructuredSseEvent;
export type DoneEvent = { type: "done" };
export type AgentEvent = TokenEvent | ToolCallEvent | DoneEvent;

export type Message = {
  role: "user" | "assistant";
  text: string;
  toolCalls: ToolCallEvent[];
};

export interface VoiceResult {
  conversation_id: string;
  transcript: string;
  response_text: string;
  audio_base64: string;
  tool_calls: Array<{
    type: "tool_call";
    name: string;
    status: "running" | "done" | "error";
    result: string | null;
  }>;
  structured_data?: StructuredDemoData | null;
  stt_structured?: SttNormalizationT | null;
}

