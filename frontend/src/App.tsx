import { ChatView } from "./components/ChatView";

export default function App() {
  return (
    <div className="min-h-screen bg-zinc-900 text-zinc-100 flex flex-col">
      <header className="border-b border-zinc-800 px-6 py-4 flex items-center gap-3">
        <span className="text-xl">📅</span>
        <h1 className="font-semibold">VoiceCal</h1>
        <span
          className="ml-auto w-2 h-2 rounded-full bg-emerald-400"
          title="Connected"
        />
      </header>
      <main className="flex-1 max-w-2xl w-full mx-auto overflow-hidden flex flex-col">
        <ChatView />
      </main>
    </div>
  );
}
