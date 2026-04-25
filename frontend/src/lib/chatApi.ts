import type { StreamEvent, ToolCallEvent } from "./types";
import { apiUrl } from "./apiBase";

export interface BackendEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  attendees: string[];
  description?: string | null;
}

export async function fetchEvents(signal?: AbortSignal): Promise<BackendEvent[]> {
  const res = await fetch(apiUrl("/api/events"), { signal });
  if (!res.ok) {
    throw new Error(`Fetch events failed: ${res.status} ${res.statusText}`);
  }
  const data = (await res.json()) as { events: BackendEvent[] };
  return data.events ?? [];
}

interface SendChatOptions {
  endpoint?: string;
  conversationId?: string | null;
  signal?: AbortSignal;
  onEvent?: (event: StreamEvent) => void;
  onToken?: (text: string) => void;
}

export interface ChatResult {
  conversation_id: string | null;
  text: string;
  tool_calls: ToolCallEvent[];
}

/**
 * POSTs a text message to /api/chat and consumes the SSE stream, aggregating
 * tokens into a final text response. Mirrors the voice flow's response shape.
 */
export async function sendChat(
  message: string,
  {
    endpoint = "/api/chat",
    conversationId,
    signal,
    onEvent,
    onToken,
  }: SendChatOptions = {},
): Promise<ChatResult> {
  const res = await fetch(apiUrl(endpoint), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    body: JSON.stringify({
      message,
      conversation_id: conversationId ?? null,
    }),
    signal,
  });

  if (!res.ok || !res.body) {
    throw new Error(`Chat request failed: ${res.status} ${res.statusText}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  let convId: string | null = conversationId ?? null;
  const toolCalls: ToolCallEvent[] = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // SSE frames are separated by a blank line.
    let sep: number;
    while ((sep = buffer.indexOf("\n\n")) !== -1) {
      const frame = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);

      for (const line of frame.split("\n")) {
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (!data || data === "[DONE]") continue;

        let parsed: StreamEvent;
        try {
          parsed = JSON.parse(data) as StreamEvent;
        } catch {
          continue;
        }

        if (parsed.type === "session") {
          convId = parsed.conversation_id;
        } else if (parsed.type === "token") {
          text += parsed.text;
          onToken?.(parsed.text);
        } else if (parsed.type === "tool_call") {
          toolCalls.push(parsed);
        }
        onEvent?.(parsed);
      }
    }
  }

  return { conversation_id: convId, text, tool_calls: toolCalls };
}
