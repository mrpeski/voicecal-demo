import { COLORS } from '../constants';
import { formatDate, formatTime, mdToHtml } from '../utils';

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
              <div
                style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.65 }}
                dangerouslySetInnerHTML={{ __html: mdToHtml(result.text) }}
              />
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
          </div>
        </>
      )}

      {/* Listening state */}
      {result.state === 'listening' && (
        <div style={{ color: 'var(--text2)', fontSize: 13, fontStyle: 'italic' }}>
          &quot;{result.transcript}&quot;
        </div>
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
          {result.text && (
            <div
              style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.65 }}
              dangerouslySetInnerHTML={{ __html: mdToHtml(result.text) }}
            />
          )}
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
