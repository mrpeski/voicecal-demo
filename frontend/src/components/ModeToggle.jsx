import React from 'react';

const MODES = [
  { id: 'zen', label: 'Zen' },
  { id: 'plan', label: 'Plan' },
  { id: 'insights', label: 'Insights' },
];

export default function ModeToggle({ mode, setMode }) {
  return (
    <div
      style={{
        display: 'flex',
        background: 'var(--surface2)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        padding: 2,
        gap: 1,
      }}
    >
      {MODES.map(({ id, label }) => (
        <button
          key={id}
          onClick={() => setMode(id)}
          style={{
            background: mode === id ? 'var(--surface3)' : 'transparent',
            border: 'none',
            borderRadius: 6,
            padding: '4px 9px',
            color: mode === id ? 'var(--text)' : 'var(--text3)',
            fontSize: 11,
            fontWeight: mode === id ? 500 : 400,
            cursor: 'pointer',
            transition: 'all 0.15s',
            fontFamily: 'DM Sans,sans-serif',
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
