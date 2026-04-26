import { useMemo, useRef, useState } from 'react';
import { ApiError } from '../lib/apiError';
import { runEvals, type EvalResult, type EvalStatus } from '../lib/evalApi';

interface EvalPanelProps {
  open: boolean;
  onClose: () => void;
}

const STATUS_META: Record<EvalStatus, { icon: string; color: string; label: string }> = {
  running: { icon: '⏳', color: 'var(--text3)', label: 'Running' },
  pass: { icon: '✓', color: 'oklch(70% 0.15 155)', label: 'Pass' },
  fail: { icon: '✗', color: 'oklch(65% 0.18 20)', label: 'Fail' },
  error: { icon: '!', color: 'oklch(65% 0.18 60)', label: 'Error' },
};

export default function EvalPanel({ open, onClose }: EvalPanelProps) {
  const [results, setResults] = useState<EvalResult[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const { passes, fails, errors, total, completed } = useMemo(() => {
    let p = 0;
    let f = 0;
    let er = 0;
    let c = 0;
    for (const r of results) {
      if (r.status === 'running') continue;
      c++;
      if (r.status === 'pass') p++;
      else if (r.status === 'fail') f++;
      else er++;
    }
    return { passes: p, fails: f, errors: er, total: results.length, completed: c };
  }, [results]);

  async function handleRun() {
    if (running) return;
    setError(null);
    setResults([]);
    setRunning(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      await runEvals({
        signal: ctrl.signal,
        onEvent: (ev) => {
          setResults((prev) => {
            const idx = prev.findIndex((r) => r.id === ev.result.id);
            if (idx === -1) return [...prev, ev.result];
            const copy = prev.slice();
            copy[idx] = ev.result;
            return copy;
          });
        },
      });
    } catch (err) {
      if ((err as { name?: string })?.name === 'AbortError') return;
      if (err instanceof ApiError) {
        setError(`${err.message} [${err.code} · HTTP ${err.status}]`);
        return;
      }
      setError((err as Error).message);
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  }

  function handleStop() {
    abortRef.current?.abort();
    setRunning(false);
  }

  const passRate = completed > 0 ? Math.round((passes / completed) * 100) : 0;

  if (!open) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        width: 'min(420px, 92vw)',
        background: 'var(--surface)',
        borderLeft: '1px solid var(--border)',
        boxShadow: '-8px 0 24px rgba(0,0,0,0.18)',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 50,
        animation: 'slideInRight 0.2s ease',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 16px',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em' }}>Evals</div>
          <div style={{ fontSize: 11, color: 'var(--text3)' }}>
            {running ? 'Running…' : `${total} scenarios`}
          </div>
        </div>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--text3)',
            cursor: 'pointer',
            fontSize: 14,
            padding: '4px 8px',
          }}
        >
          ✕
        </button>
      </div>

      {/* Run controls + summary */}
      <div
        style={{
          padding: '14px 16px',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={running ? handleStop : handleRun}
            style={{
              flex: '0 0 auto',
              background: running ? 'var(--surface2)' : 'var(--accent)',
              color: running ? 'var(--text2)' : '#fff',
              border: '1px solid var(--border)',
              borderRadius: 10,
              padding: '8px 14px',
              fontSize: 13,
              fontWeight: 500,
              cursor: 'pointer',
              fontFamily: 'DM Sans,sans-serif',
            }}
          >
            {running ? 'Stop' : 'Run all'}
          </button>

          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <div
              style={{
                fontSize: 28,
                fontWeight: 700,
                letterSpacing: '-0.02em',
                color:
                  completed === 0
                    ? 'var(--text3)'
                    : passRate >= 80
                      ? 'oklch(70% 0.15 155)'
                      : passRate >= 50
                        ? 'oklch(72% 0.15 60)'
                        : 'oklch(65% 0.18 20)',
              }}
            >
              {completed === 0 ? '—' : `${passRate}%`}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text3)' }}>
              {passes}/{completed} pass
              {fails > 0 && ` · ${fails} fail`}
              {errors > 0 && ` · ${errors} err`}
            </div>
          </div>
        </div>

        {error && (
          <div
            style={{
              marginTop: 10,
              fontSize: 12,
              color: 'oklch(65% 0.18 20)',
              background: 'oklch(96% 0.04 20 / 0.4)',
              border: '1px solid oklch(65% 0.18 20 / 0.3)',
              borderRadius: 8,
              padding: '6px 10px',
            }}
          >
            {error}
          </div>
        )}
      </div>

      {/* Scenario list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 8px 16px' }}>
        {results.length === 0 && !running && (
          <div
            style={{
              padding: '32px 16px',
              textAlign: 'center',
              color: 'var(--text3)',
              fontSize: 13,
            }}
          >
            Click <strong style={{ color: 'var(--text2)' }}>Run all</strong> to execute the
            golden-set scenarios against the live agent.
          </div>
        )}
        {results.map((r) => {
          const meta = STATUS_META[r.status];
          return (
            <div
              key={r.id}
              style={{
                padding: '10px 12px',
                borderRadius: 10,
                marginBottom: 4,
                background: r.status === 'running' ? 'var(--surface2)' : 'transparent',
                transition: 'background 0.2s',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 10,
                }}
              >
                <span
                  style={{
                    flexShrink: 0,
                    width: 18,
                    textAlign: 'center',
                    color: meta.color,
                    fontWeight: 700,
                    fontSize: 13,
                    lineHeight: '20px',
                  }}
                >
                  {r.status === 'running' ? (
                    <span
                      style={{
                        display: 'inline-block',
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        background: 'var(--text3)',
                        animation: 'bounce 1s ease-in-out infinite',
                      }}
                    />
                  ) : (
                    meta.icon
                  )}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 13,
                      color: 'var(--text)',
                      lineHeight: 1.4,
                    }}
                  >
                    {r.utterance}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: 'var(--text3)',
                      marginTop: 3,
                      fontFamily: 'ui-monospace,monospace',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      flexWrap: 'wrap',
                    }}
                  >
                    <span>expects: {r.expected_tool}</span>
                    {r.status !== 'running' && r.actual_tools.length > 0 && (
                      <span>· got: {r.actual_tools.join(', ')}</span>
                    )}
                    {r.duration_ms > 0 && <span>· {r.duration_ms}ms</span>}
                  </div>
                  {r.failure_reason && (
                    <div
                      style={{
                        fontSize: 11,
                        color: meta.color,
                        marginTop: 4,
                        fontStyle: 'italic',
                      }}
                    >
                      {r.failure_reason}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
