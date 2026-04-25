import { useEffect, useMemo, useState, Dispatch, SetStateAction } from 'react';
import { COLORS, INITIAL_EVENTS, TWEAK_DEFAULTS } from './constants';
import { cleanText, genId, parseEventBlocks, todayStr } from './utils';
import { applyTheme } from './utils/theme';
import usePersistentState from './hooks/usePersistentState';
import { useVoiceInteraction } from './hooks/useVoiceInteraction';

import Header from './components/Header';
import ZenView from './components/ZenView';
import PlanView from './components/PlanView';
import InsightsView from './components/InsightsView';
import SettingsPanel from './components/SettingsPanel';
import EditModeTweaks from './components/EditModeTweaks';

// ── Types ───────────────────────────────────────────────────────────────────

type Event = {
  id: string;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  description?: string;
  colorIndex: number;
};

type TweakSettings = typeof TWEAK_DEFAULTS;

type Mode = 'zen' | 'plan' | 'insights';

type ResultState = 'thinking' | 'done';

type QueryResult = {
  state: ResultState;
  transcript?: string;
  text?: string;
  newEvents?: Event[];
} | null;

// ── Component ────────────────────────────────────────────────────────────────

export default function App() {
  // ── Persisted state ─────────────────────────────────────────────────────
  const [tweaks, setTweaks] = usePersistentState<'vc_tweaks3', TweakSettings>('vc_tweaks3', TWEAK_DEFAULTS, {
    mergeDefaults: true,
  });
  const [events, setEvents] = usePersistentState<'vc_events2', Event[]>('vc_events2', INITIAL_EVENTS as Event[]);
  const [mode, setMode] = usePersistentState<'vc_mode', Mode>('vc_mode', 'zen');

  // ── Ephemeral UI state ──────────────────────────────────────────────────
  const [zenResult, setZenResult] = useState<QueryResult>(null);
  const [planResult, setPlanResult] = useState<QueryResult>(null);
  const [settingsOpen, setSettingsOpen] = useState<boolean>(false);
  const [editMode, setEditMode] = useState<boolean>(false);

  // ── Voice I/O ───────────────────────────────────────────────────────────

  // Apply theme whenever dark mode or accent changes
  useEffect(() => {
    applyTheme(tweaks.darkMode, tweaks.accentHue);
  }, [tweaks.darkMode, tweaks.accentHue]);

  // ── Edit-mode message bridge (parent page integration) ─────────────────
  useEffect(() => {
    function handler(e: MessageEvent) {
      if (e.data?.type === '__activate_edit_mode') setEditMode(true);
      if (e.data?.type === '__deactivate_edit_mode') setEditMode(false);
    }
    window.addEventListener('message', handler);
    window.parent.postMessage({ type: '__edit_mode_available' }, '*');
    return () => window.removeEventListener('message', handler);
  }, []);

  // ── Helpers ─────────────────────────────────────────────────────────────
  function updateTweak<K extends keyof TweakSettings>(k: K, v: TweakSettings[K]) {
    setTweaks((t: TweakSettings) => ({ ...t, [k]: v }));
    window.parent.postMessage({ type: '__edit_mode_set_keys', edits: { [k]: v } }, '*');
  }

  function deleteEvent(id: string) {
    setEvents((list: Event[]) => list.filter((e: Event) => e.id !== id));
  }

  function dismissZenResult() {
    setZenResult(null);
  }
  function dismissPlanResult() {
    setPlanResult(null);
  }

  // ── AI query handler ────────────────────────────────────────────────────
  async function processQuery(text: string, transcript: string) {
    if (!text.trim()) return;
    const setResult: Dispatch<SetStateAction<QueryResult>> = mode === 'plan' ? setPlanResult : setZenResult;
    setResult({ state: 'thinking', transcript });

    const today = new Date();
    const dateStr = today.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    const ref = (n: number) => {
      const d = new Date(today);
      d.setDate(d.getDate() + n);
      return (
        d.toISOString().slice(0, 10) +
        ' (' +
        d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) +
        ')'
      );
    };

    const system = `You are VoiceCal, a helpful and concise calendar + life assistant.
Today is ${dateStr}. Time: ${today.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}.
References: tomorrow=${ref(1)}, in 2 days=${ref(2)}, in 1 week=${ref(7)}, in 2 weeks=${ref(14)}, in 3 weeks=${ref(21)}, in 1 month=${ref(30)}.
User: ${tweaks.userName}. TZ: ${tweaks.timezone}. Work: ${tweaks.workStart}–${tweaks.workEnd}. Default duration: ${tweaks.defaultDuration}min.

Current events:
${JSON.stringify(events.map(({ id, title, date, startTime, endTime, description }) => ({ id, title, date, startTime, endTime, description })))}

To create: <create_event>{"title":"...","date":"YYYY-MM-DD","startTime":"HH:MM","endTime":"HH:MM","description":"..."}</create_event>
To delete: <delete_event>{"id":"..."}</delete_event>

For entertainment questions: give specific titles with one-line reasons. Be direct. 3 sentences max unless listing.`;

    try {
      const raw = await window.claude.complete({
        messages: [{ role: 'user', content: system + '\n\nUser: ' + text }],
      });
      const { creates, deletes } = parseEventBlocks(raw);
      const clean = cleanText(raw);

      let newEvs: Event[] = [];
      if (creates.length) {
        newEvs = creates.map((ev, i) => ({
          ...ev,
          id: genId(),
          colorIndex: (events.length + i) % COLORS.length,
        }));
        setEvents((p: Event[]) => [...p, ...newEvs]);
      }
      if (deletes.length) {
        const ids = new Set(deletes.map((d) => d.id));
        setEvents((p: Event[]) => p.filter((e) => !ids.has(e.id)));
      }

      setResult({
        state: 'done',
        transcript,
        text: clean,
        newEvents: newEvs.length ? newEvs : undefined,
      });
    } catch {
      const err = 'Sorry, something went wrong. Please try again.';
      setResult({ state: 'done', transcript, text: err });
    }
  }

  // ── Speech recognition ──────────────────────────────────────────────────
  const setActiveResult: Dispatch<SetStateAction<QueryResult>> = mode === 'plan' ? setPlanResult : setZenResult;

  const { recording: listening, pending, start: startListening, stop: stopListening } = useVoiceInteraction({
    onResult: (data: QueryResult) => setActiveResult(data)
  });

  function handleMicClick() {
    if (listening) stopListening();
    else startListening();
  }

  // ── Derived: upcoming events ────────────────────────────────────────────
  const upcomingEvents = useMemo(
    () =>
      [...events]
        .sort((a: Event, b: Event) =>
          a.date !== b.date
            ? a.date.localeCompare(b.date)
            : (a.startTime || '').localeCompare(b.startTime || '')
        )
        .filter((e: Event) => e.date >= todayStr())
        .slice(0, 8),
    [events]
  );

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        transition: 'background 0.3s',
      }}
    >
      <Header
        mode={mode}
        setMode={setMode}
        darkMode={tweaks.darkMode}
        onToggleDarkMode={() => updateTweak('darkMode', !tweaks.darkMode)}
        speaking={false}
        onStopSpeaking={() => {}}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      {mode === 'zen' && (
        <ZenView
          tweaks={tweaks}
          result={zenResult}
          onDismissResult={dismissZenResult}
          listening={listening}
          onMicClick={handleMicClick}
          onSend={(t: string) => processQuery(t, t)}
          upcomingEvents={upcomingEvents}
          onDeleteEvent={deleteEvent}
        />
      )}

      {mode === 'plan' && (
        <PlanView
          events={events}
          onQuery={processQuery}
          result={planResult}
          onDismissResult={dismissPlanResult}
          onDeleteEvent={deleteEvent}
          tweaks={tweaks}
        />
      )}

      {mode === 'insights' && <InsightsView events={events} tweaks={tweaks} />}

      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={tweaks}
        onChange={updateTweak}
      />

      {editMode && (
        <EditModeTweaks
          tweaks={tweaks}
          updateTweak={updateTweak}
          mode={mode}
          setMode={setMode}
        />
      )}
    </div>
  );
}
