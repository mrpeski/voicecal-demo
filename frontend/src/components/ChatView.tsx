
import { useEffect, useRef, useState } from "react";
import { streamChat } from "../lib/api";
import type { Message, ToolCallEvent } from "../lib/types";
import { MessageBubble } from "./MessageBubble";

export function ChatView() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send(text: string) {
    if (!text.trim() || loading) return;
    setMessages((prev) => [...prev, { role: "user", text, toolCalls: [] }]);
    setInput("");
    setLoading(true);
    setMessages((prev) => [
      ...prev,
      { role: "assistant", text: "", toolCalls: [] },
    ]);

    try {
      for await (const event of streamChat(text, messages)) {
        setMessages((prev) => {
          const updated = [...prev];
          const last = { ...updated[updated.length - 1] };
          if (event.type === "token") {
            last.text += event.text;
          } else if (event.type === "tool_call") {
            const idx = last.toolCalls.findIndex(
              (tc) => tc.name === event.name && tc.status === "running",
            );
            last.toolCalls =
              idx >= 0
                ? last.toolCalls.map((tc, i) =>
                  i === idx ? (event as ToolCallEvent) : tc,
                )
                : [...last.toolCalls, event as ToolCallEvent];
          }
          updated[updated.length - 1] = last;
          return updated;
        });
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-4">
        {messages.length === 0 && (
          <p className="text-zinc-500 text-sm text-center mt-8">
            Ask about your calendar — try "what's on my calendar this week?"
          </p>
        )}
        {messages.map((m, i) => (
          <MessageBubble key={i} message={m} />
        ))}
        <div ref={bottomRef} />
      </div>
      <div className="border-t border-zinc-800 p-4 flex gap-2">
        <input
          className="flex-1 bg-zinc-800 rounded-xl px-4 py-2 text-sm
                     text-zinc-100 placeholder-zinc-500 outline-none
                     focus:ring-2 focus:ring-indigo-500"
          placeholder="Ask about your calendar…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send(input)}
          disabled={loading}
        />
        <button
          onClick={() => send(input)}
          disabled={loading || !input.trim()}
          className="bg-indigo-600 text-white rounded-xl px-4 py-2 text-sm
                     disabled:opacity-40 hover:bg-indigo-500 transition-colors"
        >
          {loading ? "…" : "Send"}
        </button>
      </div>
    </div>
  );
}
