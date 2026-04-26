import type { StreamEvent, Message } from "./types";
import { apiUrl } from "./apiBase";
import { toApiError } from "./apiError";
import { withAuthHeaders } from "./authHeaders";

export async function* streamChat(
  text: string,
  history: Message[],
  conversationId: string | null,
  getToken?: () => Promise<string | null>,
): AsyncGenerator<StreamEvent> {
  const res = await fetch(apiUrl("/api/chat"), {
    method: "POST",
    headers: await withAuthHeaders(getToken, { "Content-Type": "application/json" }),
    body: JSON.stringify({
      message: text,
      history,
      conversation_id: conversationId, // null on first turn
    }),
  });

  if (!res.ok) {
    throw await toApiError(res, "Chat request failed");
  }
  if (!res.body) {
    throw new Error("Chat response stream was empty");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload) continue;
      try {
        yield JSON.parse(payload) as StreamEvent;
      } catch {
        // ignore malformed chunks
      }
    }
  }
}
