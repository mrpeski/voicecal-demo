import { COLORS } from '../constants';
import type { StructuredDemoData, SttNormalizationT } from '../lib/types';
import { formatDate, formatTime } from '../utils';
import ResultMarkdown from './ResultMarkdown';

function formatIsoWindow(startIso: string, endIso: string): string {
  try {
    const a = new Date(startIso);
    const b = new Date(endIso);
    if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return '';
    return `${a.toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} – ${b.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
  } catch {
    return '';
  }
}

function SttStructuredBlock({ stt }: { stt: SttNormalizationT }) {
  return (
    <div
      style={{
        marginBottom: 10,
        padding: '8px 10px',
        borderRadius: 8,
        background: 'var(--surface2)',
        border: '1px solid var(--border)',
        fontSize: 12,
        color: 'var(--text2)',
        lineHeight: 1.45,
      }}
    >
      <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', color: 'var(--text3)', marginBottom: 4 }}>
        VOICE (STT)
      </div>
      <div style={{ color: 'var(--text)' }}>{stt.normalized_intent}</div>
      {stt.duration_minutes != null && (
        <div style={{ marginTop: 4, fontSize: 11 }}>Duration: ~{stt.duration_minutes} min</div>
      )}
      {stt.attendee_names.length > 0 && (
        <div style={{ marginTop: 4, fontSize: 11 }}>People: {stt.attendee_names.join(', ')}</div>
      )}
      {stt.date_refs_resolved.length > 0 && (
        <ul style={{ margin: '6px 0 0 0', paddingLeft: 18, fontSize: 11, color: 'var(--text3)' }}>
          {stt.date_refs_resolved.map((d, i) => (
            <li key={i}>{d}</li>
          ))}
        </ul>
      )}
      {stt.needs_clarification && (
        <div style={{ marginTop: 6, fontSize: 11, color: 'oklch(70% 0.15 85)' }}>Needs clarification</div>
      )}
    </div>
  );
}

function conflictTone(sev: 'low' | 'medium' | 'high'): string {
  if (sev === 'high') return 'oklch(70% 0.2 25)';
  if (sev === 'medium') return 'oklch(75% 0.15 85)';
  return 'var(--text3)';
}

function StructuredBundleBlock({ data }: { data: StructuredDemoData }) {
  const chips = data.calendar_chips ?? [];
  const plan = data.weekly_plan;
  const conflicts = data.conflicts ?? [];
  const clar = data.clarification;
  const evl = data.eval_trace;

  const hasPlan =
    Boolean(plan?.last_week_read) ||
    Boolean(plan?.this_week_headline) ||
    (plan?.goal_alignment?.length ?? 0) > 0 ||
    (plan?.recommended_actions?.length ?? 0) > 0;

  return (
    <div
      style={{
        marginTop: 12,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        paddingTop: 10,
        borderTop: '1px solid var(--border)',
      }}
    >
      {chips.length > 0 && (
        <div>
          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', color: 'var(--text3)', marginBottom: 6 }}>
            SUGGESTED BLOCKS
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {chips.map((c, i) => (
              <div
                key={i}
                style={{
                  padding: '4px 8px 6px',
                  borderRadius: 8,
                  background: 'var(--surface2)',
                  border: '1px solid var(--border)',
                  maxWidth: '100%',
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{c.label}</div>
                <div style={{ fontSize: 10, color: 'var(--text2)', marginTop: 2 }}>{formatIsoWindow(c.start_iso, c.end_iso)}</div>
                <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>{c.kind} · {Math.round((c.confidence ?? 0) * 100)}%</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {hasPlan && plan && (
        <div>
          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', color: 'var(--text3)', marginBottom: 6 }}>
            WEEKLY PLAN
          </div>
          {plan.last_week_read ? <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 6, lineHeight: 1.45 }}>{plan.last_week_read}</div> : null}
          {plan.this_week_headline ? <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{plan.this_week_headline}</div> : null}
          {(plan.goal_alignment?.length ?? 0) > 0 && (
            <ul style={{ fontSize: 12, color: 'var(--text2)', margin: '6px 0 0 16px', lineHeight: 1.4 }}>
              {plan.goal_alignment.map((g, j) => (
                <li key={j}>{g}</li>
              ))}
            </ul>
          )}
          {(plan.recommended_actions?.length ?? 0) > 0 && (
            <ul style={{ fontSize: 12, color: 'var(--text2)', margin: '6px 0 0 16px', lineHeight: 1.4 }}>
              {plan.recommended_actions.map((a, j) => (
                <li key={j}>{a}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {conflicts.length > 0 && (
        <div>
          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', color: 'var(--text3)', marginBottom: 6 }}>
            CONFLICTS
          </div>
          {conflicts.map((cf, k) => (
            <div
              key={k}
              style={{
                marginBottom: 6,
                padding: '6px 8px',
                borderLeft: `3px solid ${conflictTone(cf.severity)}`,
                background: 'var(--surface2)',
                borderRadius: 6,
                fontSize: 12,
                lineHeight: 1.4,
                color: 'var(--text2)',
              }}
            >
              <span style={{ textTransform: 'uppercase', fontSize: 10, color: conflictTone(cf.severity) }}>{cf.severity}</span>
              {' '}
              {cf.reason}
              {cf.affected_event_ids.length > 0 && (
                <div style={{ fontSize: 10, fontFamily: 'ui-monospace, Menlo, monospace', marginTop: 4, color: 'var(--text3)' }}>
                  {cf.affected_event_ids.join(', ')}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {clar && clar.kind && clar.kind !== 'none' && clar.user_visible_prompt && (
        <div
          style={{
            padding: '8px 10px',
            borderRadius: 8,
            background: 'oklch(32% 0.04 270 / 0.35)',
            border: '1px solid var(--border)',
            fontSize: 12,
            color: 'var(--text2)',
            lineHeight: 1.45,
          }}
        >
          <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text3)', marginBottom: 4 }}>CLARIFY: {clar.kind}</div>
          {clar.user_visible_prompt}
        </div>
      )}

      {evl && (evl.intent || evl.tool_to_call || evl.args_preview) && (
        <div
          style={{
            padding: '8px 10px',
            borderRadius: 8,
            background: 'var(--surface2)',
            border: '1px solid var(--border)',
            fontSize: 11,
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            color: 'var(--text2)',
            lineHeight: 1.5,
          }}
        >
          <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text3)', marginBottom: 4, fontFamily: 'ui-sans-serif' }}>EVAL / INTENT TRACE</div>
          {evl.intent && <div>intent: {evl.intent}</div>}
          {evl.tool_to_call && <div>tool: {evl.tool_to_call}</div>}
          {evl.args_preview && <div>args: {evl.args_preview}</div>}
          {evl.policy_flags?.length ? <div>flags: {evl.policy_flags.join(', ')}</div> : null}
        </div>
      )}
    </div>
  );
}

/**
 * Renders the different UI states of an agent result:
 * - thinking: animated dots
 * - listening: transcript preview while recording
 * - done: final markdown output, optional transcript, and any newly‑created events
 */
function ToolCallList({ calls }: { calls: ToolCallDisplay[] }) {
  if (!calls.length) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 8 }}>
      {calls.map((tc, i) => {
        const icon = tc.status === 'running' ? '🔧' : tc.status === 'done' ? '✓' : '✕';
        const color =
          tc.status === 'error'
            ? 'var(--accent)'
            : tc.status === 'done'
              ? 'var(--text2)'
              : 'var(--text3)';
        return (
          <div
            key={i}
            style={{
              fontSize: 11,
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              color,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <span style={{ width: 12, textAlign: 'center' }}>{icon}</span>
            <span>{tc.name}</span>
            {tc.status === 'running' && (
              <span style={{ opacity: 0.6 }}>…</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function ResultCard({ result, onDismiss }: ResultCardProps) {
  if (!result) return null;
  const showStreamingContent =
    result.state === 'thinking' && (Boolean(result.text) || Boolean(result.toolCalls?.length));
  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 14,
        padding: '14px 16px',
        animation: 'slideDown 0.3s cubic-bezier(0.32,0,0,1)',
        position: 'relative',
      }}
    >
      {/* Thinking state */}
      {result.state === 'thinking' && (
        <>
          {result.transcript && (
            <div
              style={{
                fontSize: 12,
                color: 'var(--text3)',
                marginBottom: 8,
                fontStyle: 'italic',
              }}
            >
              &quot;{result.transcript}&quot;
            </div>
          )}
          <div
            style={{
              minHeight: 56,
              maxHeight: showStreamingContent ? 240 : undefined,
              overflowY: showStreamingContent ? 'auto' : 'visible',
              paddingRight: showStreamingContent ? 2 : 0,
            }}
          >
            {result.toolCalls && <ToolCallList calls={result.toolCalls} />}
            {result.text ? (
              <ResultMarkdown text={result.text} />
            ) : (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  color: 'var(--text2)',
                  fontSize: 13,
                }}
              >
                <div style={{ display: 'flex', gap: 4 }}>
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      style={{
                        width: 5,
                        height: 5,
                        borderRadius: '50%',
                        background: 'var(--text3)',
                        display: 'inline-block',
                        animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite`,
                      }}
                    />
                  ))}
                </div>
                <span>Thinking…</span>
              </div>
            )}
            {result.sttStructured && <SttStructuredBlock stt={result.sttStructured} />}
            {result.structuredData && <StructuredBundleBlock data={result.structuredData} />}
          </div>
        </>
      )}

      {/* Listening state */}
      {result.state === 'listening' && (
        <div style={{ color: 'var(--text2)', fontSize: 13, fontStyle: 'italic' }}>
          &quot;{result.transcript}&quot;
        </div>
      )}

      {/* API / guardrail error (e.g. use_policy, rate_limited, validation_error) */}
      {result.state === 'error' && result.errorMessage && (
        <>
          {onDismiss && (
            <button
              onClick={onDismiss}
              style={{
                position: 'absolute',
                top: 10,
                right: 10,
                background: 'none',
                border: 'none',
                color: 'var(--text3)',
                cursor: 'pointer',
                fontSize: 13,
                padding: '2px 4px',
              }}
            >
              ✕
            </button>
          )}
          {result.transcript && (
            <div
              style={{
                fontSize: 12,
                color: 'var(--text3)',
                marginBottom: 8,
                fontStyle: 'italic',
                paddingRight: 20,
              }}
            >
              &quot;{result.transcript}&quot;
            </div>
          )}
          <div
            style={{
              borderLeft: '3px solid oklch(65% 0.2 30)',
              padding: '10px 12px',
              background: 'oklch(30% 0.03 30 / 0.15)',
              borderRadius: 8,
            }}
          >
            {result.errorCode && (
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                  color: 'var(--text2)',
                  marginBottom: 6,
                  fontFamily: 'ui-monospace, Menlo, monospace',
                }}
              >
                {result.errorCode}
                {result.httpStatus != null ? (
                  <span style={{ fontWeight: 500, color: 'var(--text3)', marginLeft: 6 }}>
                    HTTP {result.httpStatus}
                  </span>
                ) : null}
              </div>
            )}
            <div style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.55 }}>{result.errorMessage}</div>
          </div>
        </>
      )}

      {/* Done state */}
      {result.state === 'done' && (
        <>
          {onDismiss && (
            <button
              onClick={onDismiss}
              style={{
                position: 'absolute',
                top: 10,
                right: 10,
                background: 'none',
                border: 'none',
                color: 'var(--text3)',
                cursor: 'pointer',
                fontSize: 13,
                padding: '2px 4px',
              }}
            >
              ✕
            </button>
          )}
          {result.transcript && (
            <div
              style={{
                fontSize: 12,
                color: 'var(--text3)',
                marginBottom: 8,
                fontStyle: 'italic',
                paddingRight: 20,
              }}
            >
              &quot;{result.transcript}&quot;
            </div>
          )}
          {result.toolCalls && <ToolCallList calls={result.toolCalls} />}
          {result.text && <ResultMarkdown text={result.text} />}
          {result.sttStructured && <SttStructuredBlock stt={result.sttStructured} />}
          {result.structuredData && <StructuredBundleBlock data={result.structuredData} />}
          {result.newEvents &&
            result.newEvents.map((ev, i) => (
              <div
                key={i}
                style={{
                  marginTop: 10,
                  background: 'var(--surface2)',
                  border: '1px solid var(--border)',
                  borderRadius: 9,
                  padding: '10px 12px',
                  borderLeft: `3px solid ${COLORS[ev.colorIndex % COLORS.length]
                    }`,
                }}
              >
                <div style={{ fontWeight: 600, fontSize: 13 }}>{ev.title}</div>
                <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>
                  {formatDate(ev.date)}
                  {ev.startTime &&
                    ` · ${formatTime(ev.startTime)}${ev.endTime ? ` – ${formatTime(ev.endTime)}` : ''
                    }`}
                </div>
              </div>
            ))}
        </>
      )}
    </div>
  );
}
