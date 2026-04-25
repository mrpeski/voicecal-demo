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

export type StreamEvent = TokenEvent | ToolCallEvent | SessionEvent;
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
}

