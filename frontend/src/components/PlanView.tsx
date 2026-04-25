import { useState, useRef, useMemo } from 'react';
import { COLORS, PRESET_GROUPS, SMART_PROMPTS } from '../constants';
import { todayStr, timeToMins, formatTime } from '../utils';
import ResultCard from './ResultCard';

export default function PlanView({
  events,
  onQuery,
  result,
  onDismissResult,
  onDeleteEvent,
  tweaks,
}: PlanViewProps) {
  const [activeGroup, setActiveGroup] = useState(0);
  const [customInput, setCustomInput] = useState('');
  const customRef = useRef<HTMLInputElement | null>(null);

  // Today's events sorted by start time
  const todayEvs = useMemo(
    () =>
      events
        .filter((e) => e.date === todayStr())
        .sort((a, b) => (a.startTime || '').localeCompare(b.startTime || '')),
    [events]
  );

  const now = new Date();
  const nowMins = now.getHours() * 60 + now.getMinutes();

  // Rough "free time left in workday" calculation
  const workStart = timeToMins(tweaks.workStart);
  const workEnd = timeToMins(tweaks.workEnd);
  const busyMins = todayEvs
    .filter((e) => e.startTime && e.endTime)
    .reduce((acc, e) => acc + Math.max(timeToMins(e.endTime) - timeToMins(e.startTime), 0), 0);
  const freeLeft = Math.max(
    workEnd -
      Math.max(nowMins, workStart) -
      Math.max(busyMins - (Math.max(nowMins, workStart) - workStart), 0),
    0
  );
  const freeStr =
    freeLeft > 0
      ? `${Math.floor(freeLeft / 60)}h ${freeLeft % 60 > 0 ? (freeLeft % 60) + 'm ' : ''}left`
      : null;

  const greet =
    now.getHours() < 12 ? 'Good morning' : now.getHours() < 17 ? 'Good afternoon' : 'Good evening';

  function submitCustom() {
    const t = customInput.trim();
    if (!t) return;
    onQuery(t, t);
    setCustomInput('');
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>
      <div
        style={{
          maxWidth: 440,
          width: '100%',
          margin: '0 auto',
          padding: '20px 20px 32px',
          display: 'flex',
          flexDirection: 'column',
          gap: 20,
        }}
      >
        {/* Greeting */}
        <div>
          <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 2 }}>
            {now.toLocaleDateString('en-US', {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
            })}
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em' }}>
              {tweaks.userName !== 'User' ? `${greet}, ${tweaks.userName}.` : `${greet}.`}
            </div>
            {freeStr && (
              <div style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 500 }}>
                {freeStr} free
              </div>
            )}
          </div>
        </div>

        {/* Result card */}
        {result && (
          <ResultCard
            result={result}
            onDismiss={
              result.state === 'done'
                ? () => {
                    onDismissResult();
                    window.speechSynthesis?.cancel();
                  }
                : undefined
            }
          />
        )}

        {/* Today list */}
        {todayEvs.length > 0 && (
          <div>
            <div
              style={{
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'var(--text3)',
                marginBottom: 8,
              }}
            >
              Today
            </div>
            {todayEvs.map((ev) => {
              const color = COLORS[ev.colorIndex % COLORS.length];
              const isPast = ev.endTime && timeToMins(ev.endTime) < nowMins;
              return (
                <div
                  key={ev.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '7px 10px',
                    borderRadius: 8,
                    opacity: isPast ? 0.4 : 1,
                  }}
                >
                  <div
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      background: color,
                      flexShrink: 0,
                    }}
                  />
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 500,
                      color: 'var(--text)',
                      flex: 1,
                      minWidth: 0,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {ev.title}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--text3)', flexShrink: 0 }}>
                    {ev.startTime && formatTime(ev.startTime)}
                  </span>
                  <button
                    onClick={() => onDeleteEvent(ev.id)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--text3)',
                      cursor: 'pointer',
                      fontSize: 11,
                      padding: '2px 3px',
                      opacity: 0.5,
                    }}
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Smart prompts */}
        <div>
          <div
            style={{
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--text3)',
              marginBottom: 8,
            }}
          >
            Quick asks
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {SMART_PROMPTS.map((p, i) => (
              <button
                key={i}
                onClick={() => onQuery(p.prompt, p.label)}
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 10,
                  padding: '10px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                  textAlign: 'left',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'var(--border2)';
                  e.currentTarget.style.background = 'var(--surface2)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--border)';
                  e.currentTarget.style.background = 'var(--surface)';
                }}
              >
                <span
                  style={{ fontSize: 13, color: 'var(--text)', fontFamily: 'DM Sans,sans-serif' }}
                >
                  {p.label}
                </span>
                <span style={{ fontSize: 11, color: 'var(--text3)' }}>→</span>
              </button>
            ))}
          </div>
        </div>

        {/* Preset groups */}
        <div>
          <div
            style={{
              display: 'flex',
              gap: 6,
              marginBottom: 10,
              overflowX: 'auto',
              paddingBottom: 2,
            }}
          >
            {PRESET_GROUPS.map((g, i) => (
              <button
                key={i}
                onClick={() => setActiveGroup(i)}
                style={{
                  background: activeGroup === i ? 'var(--accent-dim)' : 'none',
                  border: `1px solid ${activeGroup === i ? 'var(--accent)' : 'var(--border)'}`,
                  borderRadius: 20,
                  padding: '4px 12px',
                  fontSize: 11,
                  fontWeight: 500,
                  color: activeGroup === i ? 'var(--accent)' : 'var(--text3)',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  transition: 'all 0.15s',
                  fontFamily: 'DM Sans,sans-serif',
                  flexShrink: 0,
                }}
              >
                {g.label}
              </button>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            {PRESET_GROUPS[activeGroup].items.map((item, i) => (
              <button
                key={i}
                onClick={() => onQuery(item.prompt, item.label)}
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 10,
                  padding: '11px 14px',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                  textAlign: 'left',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'var(--border2)';
                  e.currentTarget.style.background = 'var(--surface2)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--border)';
                  e.currentTarget.style.background = 'var(--surface)';
                }}
              >
                <span
                  style={{ fontSize: 13, color: 'var(--text)', fontFamily: 'DM Sans,sans-serif' }}
                >
                  {item.label}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Custom input */}
        <div
          style={{
            display: 'flex',
            gap: 8,
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            padding: '8px 8px 8px 14px',
          }}
        >
          <input
            ref={customRef}
            value={customInput}
            onChange={(e) => setCustomInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submitCustom();
            }}
            placeholder="Or type anything…"
            style={{
              flex: 1,
              background: 'none',
              border: 'none',
              outline: 'none',
              color: 'var(--text)',
              fontSize: 13,
              fontFamily: 'DM Sans,sans-serif',
            }}
          />
          <button
            onClick={submitCustom}
            disabled={!customInput.trim()}
            style={{
              background: customInput.trim() ? 'var(--accent)' : 'var(--surface2)',
              border: 'none',
              borderRadius: 8,
              width: 32,
              height: 32,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: customInput.trim() ? 'pointer' : 'default',
              color: customInput.trim() ? '#fff' : 'var(--text3)',
              flexShrink: 0,
              transition: 'all 0.15s',
            }}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path
                d="M10 6H2M10 6L7 3M10 6L7 9"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
