import { useEffect, useMemo, useState, type Dispatch, type SetStateAction, type ReactNode } from 'react';
import { COLORS, INITIAL_EVENTS, TWEAK_DEFAULTS } from './constants';
import { todayStr } from './utils';
import { applyTheme } from './utils/theme';
import usePersistentState from './hooks/usePersistentState';
import { useVoiceInteraction } from './hooks/useVoiceInteraction';
import { fetchEvents, sendChat } from './lib/chatApi';
import { ApiError } from './lib/apiError';
import type { VoiceResult } from './lib/types';

import Header from './components/Header';
import ZenView from './components/ZenView';
import PlanView from './components/PlanView';
import InsightsView from './components/InsightsView';
import SettingsPanel from './components/SettingsPanel';
import EditModeTweaks from './components/EditModeTweaks';
import EvalPanel from './components/EvalPanel';
import type { GetClerkToken } from './lib/authTypes';

export type { GetClerkToken } from './lib/authTypes';

export interface AppProps {
  getToken?: GetClerkToken;
  userButton?: ReactNode;
}

export default function App({ getToken, userButton }: AppProps = {}) {
  // ── Persisted state ─────────────────────────────────────────────────────
  const [tweaks, setTweaks] = usePersistentState<VoiceCalTweakSettings>('vc_tweaks3', TWEAK_DEFAULTS, {
    mergeDefaults: true,
  });
  const [events, setEvents] = usePersistentState<VoiceCalEvent[]>('vc_events2', INITIAL_EVENTS as VoiceCalEvent[]);
  const [mode, setMode] = usePersistentState<Mode>('vc_mode', 'zen');

  // ── Ephemeral UI state ──────────────────────────────────────────────────
  const [zenResult, setZenResult] = useState<VoiceCalQueryResult>(null);
  const [planResult, setPlanResult] = useState<VoiceCalQueryResult>(null);
  const [insightsResult, setInsightsResult] = useState<VoiceCalQueryResult>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [evalOpen, setEvalOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [typeRequest, setTypeRequest] = useState<{ value: string; nonce: number } | null>(null);

  // ── Voice I/O ───────────────────────────────────────────────────────────

  // Apply theme whenever dark mode or accent changes
  useEffect(() => {
    applyTheme(tweaks.darkMode, tweaks.accentHue);
  }, [tweaks.darkMode, tweaks.accentHue]);

  // Boot fetch: pull events from the backend on mount and merge into local state.
  useEffect(() => {
    const ctrl = new AbortController();
    fetchEvents(ctrl.signal, getToken)
      .then((backendEvents) => {
        const mapped = backendEvents
          .map((ev) => toolOutputToLocalEvent(JSON.stringify(ev)))
          .filter((e): e is VoiceCalEvent => e !== null);
        if (!mapped.length) return;
        setEvents((list) => {
          const byId = new Map(list.map((e) => [e.id, e]));
          for (const ev of mapped) byId.set(ev.id, ev);
          return Array.from(byId.values());
        });
      })
      .catch((err) => {
        if ((err as { name?: string })?.name === 'AbortError') return;
        console.warn('boot fetch /api/events failed', err);
      });
    return () => ctrl.abort();
  }, [getToken]);

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
  function updateTweak<K extends keyof VoiceCalTweakSettings>(k: K, v: VoiceCalTweakSettings[K]) {
    setTweaks((t) => ({ ...t, [k]: v }));
    window.parent.postMessage({ type: '__edit_mode_set_keys', edits: { [k]: v } }, '*');
  }

  function deleteEvent(id: string) {
    setEvents((list) => list.filter((e) => e.id !== id));
  }

  function dismissZenResult() {
    setZenResult(null);
  }
  function dismissPlanResult() {
    setPlanResult(null);
  }


  // ── Speech recognition ──────────────────────────────────────────────────
  const setActiveResult: Dispatch<SetStateAction<VoiceCalQueryResult>> =
    mode === 'plan'
      ? setPlanResult
      : mode === 'insights'
        ? setInsightsResult
        : setZenResult;

  function handleVoiceResult(result: VoiceResult) {
    setActiveResult({
      state: 'done',
      transcript: result.transcript,
      text: result.response_text,
      toolCalls: result.tool_calls.map((tc) => ({
        name: tc.name,
        status: tc.status,
        resultPreview: tc.result?.slice(0, 160) ?? undefined,
      })),
      structuredData: result.structured_data ?? undefined,
      sttStructured: result.stt_structured ?? undefined,
    });
  }

  function toResultCard(result: VoiceCalQueryResult): ResultCardResult | undefined {
    if (!result) return undefined;
    if (result.state === 'error') {
      return {
        state: 'error',
        transcript: result.transcript,
        errorCode: result.errorCode,
        errorMessage: result.errorMessage,
        httpStatus: result.httpStatus,
      };
    }
    const normalizedState: ResultCardState = result.state === 'done' ? 'done' : 'thinking';
    return {
      state: normalizedState,
      transcript: result.transcript,
      text: result.text,
      newEvents: result.newEvents,
      toolCalls: result.toolCalls,
      structuredData: result.structuredData,
      sttStructured: result.sttStructured,
    };
  }

  const { recording: listening, start: startListening, stop: stopListening } = useVoiceInteraction({
    getToken,
    onResult: handleVoiceResult,
    onError: (err) => {
      if ((err as { name?: string })?.name === 'AbortError') return;
      if (err instanceof ApiError) {
        setActiveResult({
          state: 'error',
          transcript: 'Voice',
          errorCode: err.code,
          errorMessage: err.message,
          httpStatus: err.status,
        });
        return;
      }
      setActiveResult({
        state: 'error',
        transcript: 'Voice',
        errorCode: 'client_error',
        errorMessage: err instanceof Error ? err.message : 'Voice request failed',
      });
    },
  });

  const [conversationId, setConversationId] = usePersistentState<string | null>(
    'voicecal.conversation_id',
    null,
  );

  function toolOutputToLocalEvent(raw: string): VoiceCalEvent | null {
    try {
      const ev = JSON.parse(raw) as {
        id?: string;
        title?: string;
        start?: string;
        end?: string;
        description?: string;
      };
      if (!ev || !ev.id || !ev.start) return null;

      const start = ev.start;
      const end = ev.end ?? '';
      const date = start.slice(0, 10);
      const startTime = start.length >= 16 ? start.slice(11, 16) : undefined;
      const endTime = end.length >= 16 ? end.slice(11, 16) : undefined;

      // Stable color from title hash so the same event keeps the same color.
      const title = ev.title ?? 'Untitled';
      let hash = 0;
      for (let i = 0; i < title.length; i++) hash = (hash * 31 + title.charCodeAt(i)) | 0;
      const colorIndex = Math.abs(hash) % COLORS.length;

      return {
        id: ev.id,
        title,
        date,
        startTime,
        endTime,
        description: ev.description,
        colorIndex,
      };
    } catch {
      return null;
    }
  }

  async function handleSendMessage(message: string, displayLabel?: string) {
    const trimmed = message.trim();
    if (!trimmed) return;
    const transcript = (displayLabel ?? trimmed).trim();

    setActiveResult({ state: 'thinking', transcript, text: '', toolCalls: [] });
    try {
      const result = await sendChat(trimmed, {
        getToken,
        conversationId,
        onEvent: (ev) => {
          if (ev.type === 'token') {
            setActiveResult((prev) => ({
              state: 'thinking',
              transcript: prev?.transcript ?? transcript,
              text: (prev?.text ?? '') + ev.text,
              toolCalls: prev?.toolCalls,
            }));
          } else if (ev.type === 'tool_call') {
            setActiveResult((prev) => {
              const calls: ToolCallDisplay[] = [...(prev?.toolCalls ?? [])];
              if (ev.status === 'running') {
                calls.push({ name: ev.name, status: 'running' });
              } else {
                let matched = false;
                for (let i = calls.length - 1; i >= 0; i--) {
                  if (calls[i].name === ev.name && calls[i].status === 'running') {
                    calls[i] = {
                      name: ev.name,
                      status: ev.status,
                      resultPreview: ev.result?.slice(0, 160),
                    };
                    matched = true;
                    break;
                  }
                }
                if (!matched) {
                  calls.push({
                    name: ev.name,
                    status: ev.status,
                    resultPreview: ev.result?.slice(0, 160),
                  });
                }
              }
              return {
                state: 'thinking',
                transcript: prev?.transcript ?? transcript,
                text: prev?.text ?? '',
                toolCalls: calls,
              };
            });
          }
        },
      });

      if (result.conversation_id) setConversationId(result.conversation_id);

      // Sync local events from any successful create/update tool calls.
      for (const tc of result.tool_calls) {
        if (tc.status !== 'done' || !tc.result) continue;
        if (tc.name === 'create_event') {
          const local = toolOutputToLocalEvent(tc.result);
          if (local) setEvents((list) => [...list.filter((e) => e.id !== local.id), local]);
        } else if (tc.name === 'update_event') {
          const local = toolOutputToLocalEvent(tc.result);
          if (local) {
            setEvents((list) =>
              list.some((e) => e.id === local.id)
                ? list.map((e) => (e.id === local.id ? local : e))
                : [...list, local],
            );
          }
        }
      }

      setActiveResult({
        state: 'done',
        transcript,
        text: result.text,
        toolCalls: result.tool_calls.map((tc) => ({
          name: tc.name,
          status: tc.status,
          resultPreview: tc.result?.slice(0, 160) ?? undefined,
        })),
        structuredData: result.structured ?? undefined,
      });
    } catch (err) {
      if ((err as { name?: string })?.name === 'AbortError') {
        setActiveResult(null);
        return;
      }
      console.error('chat failed', err);
      if (err instanceof ApiError) {
        setActiveResult({
          state: 'error',
          transcript,
          errorCode: err.code,
          errorMessage: err.message,
          httpStatus: err.status,
        });
      } else {
        setActiveResult({
          state: 'error',
          transcript,
          errorCode: 'client_error',
          errorMessage: err instanceof Error ? err.message : 'Sorry, something went wrong.',
        });
      }
    }
  }

  function handleMicClick() {
    if (listening) stopListening();
    else startListening();
  }

  // ── Keyboard shortcuts: Tab cycles modes, Space toggles recording ──────
  useEffect(() => {
    const MODES: Mode[] = ['zen', 'plan', 'insights'];

    function isTypingTarget(el: EventTarget | null): boolean {
      if (!(el instanceof HTMLElement)) return false;
      const tag = el.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
      if (el.isContentEditable) return true;
      return false;
    }

    function onKeyDown(e: KeyboardEvent) {
      if (settingsOpen || editMode) return;
      if (isTypingTarget(e.target)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === 'Tab') {
        e.preventDefault();
        setMode((current) => {
          const idx = MODES.indexOf(current);
          const delta = e.shiftKey ? -1 : 1;
          return MODES[(idx + delta + MODES.length) % MODES.length];
        });
      } else if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        handleMicClick();
      } else if (e.key.length === 1 && /^[a-zA-Z]$/.test(e.key)) {
        e.preventDefault();
        if (mode !== 'zen') setMode('zen');
        setTypeRequest({ value: e.key, nonce: Date.now() + Math.random() });
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [settingsOpen, editMode, listening, mode, setMode]);

  const updateEditModeTweak = <K extends keyof EditModeTweaksState>(
    key: K,
    value: EditModeTweaksState[K],
  ) => {
    updateTweak(key, value as VoiceCalTweakSettings[K]);
  };

  // ── Derived: upcoming events ────────────────────────────────────────────
  const upcomingEvents = useMemo(
    () =>
      [...events]
        .sort((a, b) =>
          a.date !== b.date
            ? a.date.localeCompare(b.date)
            : (a.startTime || '').localeCompare(b.startTime || '')
        )
        .filter((e) => e.date >= todayStr())
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
        onOpenEvals={() => setEvalOpen(true)}
        userButton={userButton}
      />

      {mode === 'zen' && (
        <ZenView
          tweaks={tweaks}
          result={toResultCard(zenResult) ?? null}
          onDismissResult={dismissZenResult}
          listening={listening}
          onMicClick={handleMicClick}
          onSend={handleSendMessage}
          upcomingEvents={upcomingEvents}
          onDeleteEvent={deleteEvent}
          typeRequest={typeRequest}
          onTypeRequestHandled={() => setTypeRequest(null)}
        />
      )}

      {mode === 'plan' && (
        <PlanView
          events={events}
          onQuery={(prompt, label) => handleSendMessage(prompt, label)}
          result={toResultCard(planResult)}
          onDismissResult={dismissPlanResult}
          onDeleteEvent={deleteEvent}
          tweaks={tweaks}
        />
      )}

      {mode === 'insights' && (
        <InsightsView
          events={events}
          tweaks={tweaks}
          onQuery={(prompt, label) => handleSendMessage(prompt, label)}
          result={toResultCard(insightsResult) ?? null}
          onDismissResult={() => setInsightsResult(null)}
        />
      )}

      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={tweaks}
        onChange={updateTweak}
      />

      <EvalPanel
        open={evalOpen}
        onClose={() => setEvalOpen(false)}
        getToken={getToken}
      />

      {editMode && (
        <EditModeTweaks
          tweaks={{
            userName: tweaks.userName,
            accentHue: tweaks.accentHue,
            darkMode: tweaks.darkMode,
          }}
          updateTweak={updateEditModeTweak}
          mode={mode}
          setMode={setMode}
        />
      )}
    </div>
  );
}
