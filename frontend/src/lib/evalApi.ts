import { apiUrl } from "./apiBase";
import { toApiError } from "./apiError";

export type EvalStatus = "running" | "pass" | "fail" | "error";

export interface EvalResult {
  id: string;
  utterance: string;
  expected_tool: string;
  status: EvalStatus;
  actual_tools: string[];
  response_text: string;
  duration_ms: number;
  failure_reason: string | null;
}

export interface EvalEvent {
  type: "eval";
  result: EvalResult;
}

interface RunEvalsOptions {
  endpoint?: string;
  signal?: AbortSignal;
  onEvent: (event: EvalEvent) => void;
}

/** POST /api/eval and stream EvalEvents until [DONE]. */
export async function runEvals({
  endpoint = "/api/eval",
  signal,
  onEvent,
}: RunEvalsOptions): Promise<void> {
  const res = await fetch(apiUrl(endpoint), {
    method: "POST",
    headers: { Accept: "text/event-stream" },
    signal,
  });

  if (!res.ok || !res.body) {
    if (!res.ok) {
      throw await toApiError(res, "Eval request failed");
    }
    throw new Error("Eval response stream was empty");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let sep: number;
    while ((sep = buffer.indexOf("\n\n")) !== -1) {
      const frame = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);

      for (const line of frame.split("\n")) {
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (!data || data === "[DONE]") continue;
        try {
          const parsed = JSON.parse(data) as EvalEvent;
          if (parsed.type === "eval") onEvent(parsed);
        } catch {
          // ignore malformed frames
        }
      }
    }
  }
}
