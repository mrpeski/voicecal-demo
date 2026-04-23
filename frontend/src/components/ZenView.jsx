import { useRef, useState } from 'react';
import { COLORS } from '../constants';
import { formatDate, formatTime } from '../utils';
import ResultCard from './ResultCard';
import Waveform from './Waveform';

export default function ZenView({
  tweaks,
  result,
  onDismissResult,
  listening,
  onMicClick,
  onSend,
  upcomingEvents,
  onDeleteEvent,
}) {
  const [textMode, setTextMode] = useState(false);
  const [input, setInput] = useState('');
  const [upcomingExpanded, setUpcomingExpanded] = useState(false);
  const inputRef = useRef(null);

  function handleSend() {
    const t = input.trim();
    if (!t) return;
    setInput('');
    setTextMode(false);
    onSend(t);
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>
      <div
        style={{
          maxWidth: 440,
          width: '100%',
          margin: '0 auto',
          padding: '32px 20px',
          display: 'flex',
          flexDirection: 'column',
          gap: 24,
        }}
      >
        {/* Greeting / result area */}
        <div style={{ minHeight: 60 }}>
          {/* {result ? ( */}
          {/*   <ResultCard */}
          {/*     key={result.state === 'done' ? result.text : 's'} */}
          {/*     result={result} */}
          {/*     onDismiss={result.state === 'done' ? onDismissResult : undefined} */}
          {/*   /> */}
          {/* ) : ( */}
          {/*   <div */}
          {/*     style={{ */}
          {/*       textAlign: 'center', */}
          {/*       color: 'var(--text3)', */}
          {/*       fontSize: 13, */}
          {/*       animation: 'fadeIn 0.5s ease', */}
          {/*     }} */}
          {/*   > */}
          {/*     {tweaks.userName !== 'User' */}
          {/*       ? `Hi, ${tweaks.userName}.` */}
          {/*       : 'Tap the mic to get started.'} */}
          {/*   </div> */}
          {/* )} */}

          <div
            style={{
              textAlign: 'center',
              color: 'var(--text3)',
              fontSize: 13,
              animation: 'fadeIn 0.5s ease',
            }}
          >
            {tweaks.userName !== 'User'
              ? `Hi, ${tweaks.userName}.`
              : 'Tap the mic to get started.'}
          </div>
        </div>

        {/* Mic and waveform */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          <Waveform active={listening} />
          <button
            onClick={onMicClick}
            style={{
              width: 72,
              height: 72,
              borderRadius: '50%',
              background: listening ? 'var(--accent)' : 'var(--surface)',
              border: `1.5px solid ${listening ? 'var(--accent)' : 'var(--border2)'}`,
              color: listening ? '#fff' : 'var(--text2)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s cubic-bezier(0.32,0,0,1)',
              animation: listening ? 'pulse 1.5s ease-in-out infinite' : 'none',
              boxShadow: listening ? '0 0 24px var(--accent-glow)' : 'none',
            }}
          >
            {listening ? (
              <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                <rect x="3" y="2" width="5" height="16" rx="2" />
                <rect x="12" y="2" width="5" height="16" rx="2" />
              </svg>
            ) : (
              <svg width="20" height="22" viewBox="0 0 20 22" fill="none">
                <rect
                  x="6"
                  y="1"
                  width="8"
                  height="12"
                  rx="4"
                  stroke="currentColor"
                  strokeWidth="1.8"
                />
                <path
                  d="M2 11a8 8 0 0 0 16 0"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
                <line
                  x1="10"
                  y1="19"
                  x2="10"
                  y2="22"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>
            )}
          </button>

          <span style={{ fontSize: 12, color: 'var(--text3)' }}>
            {listening ? 'Tap to stop' : 'Tap to speak'}
          </span>

          {!listening && (
            <button
              onClick={() => {
                setTextMode((t) => !t);
                setTimeout(() => inputRef.current?.focus(), 50);
              }}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text3)',
                cursor: 'pointer',
                fontSize: 11,
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                padding: '4px 8px',
                borderRadius: 6,
              }}
            >
              <svg width="13" height="11" viewBox="0 0 13 11" fill="none">
                <rect
                  x="0.75"
                  y="0.75"
                  width="11.5"
                  height="9.5"
                  rx="1.5"
                  stroke="currentColor"
                  strokeWidth="1.2"
                />
                <rect x="2.5" y="3" width="1.5" height="1.5" rx=".5" fill="currentColor" />
                <rect x="5.75" y="3" width="1.5" height="1.5" rx=".5" fill="currentColor" />
                <rect x="9" y="3" width="1.5" height="1.5" rx=".5" fill="currentColor" />
                <rect x="4" y="6.5" width="5" height="1.2" rx=".6" fill="currentColor" />
              </svg>
              {textMode ? 'Hide keyboard' : 'Type instead'}
            </button>
          )}

          {textMode && !listening && (
            <div
              style={{
                width: '100%',
                display: 'flex',
                gap: 8,
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 12,
                padding: '8px 8px 8px 14px',
                animation: 'slideDown 0.2s ease',
              }}
            >
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSend();
                }}
                placeholder="Ask about your calendar…"
                style={{
                  flex: 1,
                  background: 'none',
                  border: 'none',
                  outline: 'none',
                  color: 'var(--text)',
                  fontSize: 14,
                  fontFamily: 'DM Sans,sans-serif',
                }}
              />
              <button
                onClick={handleSend}
                disabled={!input.trim()}
                style={{
                  background: input.trim() ? 'var(--accent)' : 'var(--surface2)',
                  border: 'none',
                  borderRadius: 8,
                  width: 34,
                  height: 34,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: input.trim() ? 'pointer' : 'default',
                  color: input.trim() ? '#fff' : 'var(--text3)',
                  flexShrink: 0,
                  transition: 'all 0.15s',
                }}
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path
                    d="M12 7H2M12 7L8 3M12 7L8 11"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </div>
          )}
        </div>

        {/* Upcoming events */}
        {upcomingEvents.length > 0 && (
          <div>
            <div
              style={{
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'var(--text3)',
                marginBottom: 10,
              }}
            >
              Upcoming
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {(upcomingExpanded ? upcomingEvents : upcomingEvents.slice(0, 1)).map((ev) => {
                const color = COLORS[ev.colorIndex % COLORS.length];
                return (
                  <div
                    key={ev.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '8px 10px',
                      borderRadius: 8,
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
                      {formatDate(ev.date)}
                      {ev.startTime && ` · ${formatTime(ev.startTime)}`}
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
              {upcomingEvents.length > 1 && (
                <button
                  onClick={() => setUpcomingExpanded((x) => !x)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--text3)',
                    cursor: 'pointer',
                    fontSize: 11,
                    padding: '6px 10px',
                    textAlign: 'left',
                    borderRadius: 8,
                    fontFamily: 'DM Sans,sans-serif',
                  }}
                >
                  {upcomingExpanded ? 'Show less' : `+${upcomingEvents.length - 1} more`}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
