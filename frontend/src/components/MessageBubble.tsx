import type { Message } from "../lib/types";
import { ToolCall } from "./ToolCall";

export function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";
  return (
    <div className={`flex mb-3 ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm
        ${isUser ? "bg-indigo-600 text-white" : "bg-zinc-800 text-zinc-100"}`}
      >
        {message.toolCalls.map((tc, i) => (
          <ToolCall key={i} event={tc} />
        ))}
        <p className="whitespace-pre-wrap leading-relaxed">{message.text}</p>
      </div>
    </div>
  );
}
