import React from 'react';
import ModeToggle from './ModeToggle';

export default function Header({
  mode,
  setMode,
  darkMode,
  onToggleDarkMode,
  speaking,
  onStopSpeaking,
  onOpenSettings,
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 14px',
        height: 52,
        flexShrink: 0,
        borderBottom: '1px solid var(--border)',
        background: 'var(--surface)',
      }}
    >
      <ModeToggle mode={mode} setMode={setMode} />

      <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-0.02em' }}>VoiceCal</div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        {/* Dark / light toggle */}
        <button
          onClick={onToggleDarkMode}
          title={darkMode ? 'Switch to light' : 'Switch to dark'}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            width: 34,
            height: 34,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 8,
            color: 'var(--text3)',
            transition: 'color 0.2s',
          }}
        >
          {darkMode ? (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path
                d="M13.5 9.5A6 6 0 1 1 6.5 2.5a4.5 4.5 0 0 0 7 7z"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinejoin="round"
              />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="3" stroke="currentColor" strokeWidth="1.4" />
              <path
                d="M8 1v1.5M8 13.5V15M1 8h1.5M13.5 8H15M3.05 3.05l1.06 1.06M11.89 11.89l1.06 1.06M12.95 3.05l-1.06 1.06M4.11 11.89l-1.06 1.06"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
              />
            </svg>
          )}
        </button>

        {/* Speaker / stop speaking */}
        <button
          onClick={onStopSpeaking}
          title={speaking ? 'Stop speaking' : 'Voice on'}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            width: 34,
            height: 34,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 8,
            color: speaking ? 'var(--accent)' : 'var(--text3)',
            transition: 'color 0.2s',
          }}
        >
          {speaking ? (
            <svg width="16" height="16" viewBox="0 0 17 17" fill="none">
              <path d="M3 6h2l4-4v14l-4-4H3V6z" fill="currentColor" opacity=".9" />
              <line
                x1="13"
                y1="5"
                x2="13"
                y2="12"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                style={{ animation: 'speakPulse 0.6s ease-in-out infinite alternate' }}
              />
              <line
                x1="15.5"
                y1="3.5"
                x2="15.5"
                y2="13.5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                style={{ animation: 'speakPulse 0.6s ease-in-out 0.2s infinite alternate' }}
              />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 17 17" fill="none">
              <path
                d="M3 6h2l4-4v14l-4-4H3V6z"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinejoin="round"
              />
              <path
                d="M12 5.5a4 4 0 0 1 0 6M14 3.5a7 7 0 0 1 0 10"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
              />
            </svg>
          )}
        </button>

        {/* Settings */}
        <button
          onClick={onOpenSettings}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--text2)',
            cursor: 'pointer',
            width: 34,
            height: 34,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 8,
          }}
        >
          <svg width="17" height="17" viewBox="0 0 17 17" fill="none">
            <circle cx="8.5" cy="8.5" r="2.2" stroke="currentColor" strokeWidth="1.5" />
            <path
              d="M8.5 1.5v1.2M8.5 14.3v1.2M1.5 8.5h1.2M14.3 8.5h1.2M3.6 3.6l.85.85M12.55 12.55l.85.85M3.6 13.4l.85-.85M12.55 4.45l.85-.85"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}
