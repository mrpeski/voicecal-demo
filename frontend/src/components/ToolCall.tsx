import type { ToolCallEvent } from "../lib/types";

const ICONS: Record<string, string> = {
  list_events: "📅",
  create_event: "➕",
  update_event: "✏️",
  search_calendar_history: "🔍",
};

export function ToolCall({ event }: { event: ToolCallEvent }) {
  const icon = ICONS[event.name] ?? "🔧";
  const label = event.name.replace(/_/g, " ");
  if (event.status === "running")
    return (
      <div className="text-xs text-zinc-400 italic my-1 flex gap-1">
        <span className="animate-pulse">{icon}</span> Calling {label}…
      </div>
    );
  if (event.status === "error")
    return (
      <div className="text-xs text-red-400 my-1">
        ❌ {label}: {event.result}
      </div>
    );
  return (
    <div className="text-xs text-emerald-400 my-1">
      {icon} ✓ {label}
    </div>
  );
}
