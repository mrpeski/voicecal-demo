import ModeToggle from './ModeToggle';

export default function EditModeTweaks({ tweaks, updateTweak, mode, setMode }: EditModeTweaksProps) {
  return (
    <div
      style={{
        position: 'fixed',
        bottom: 20,
        right: 20,
        zIndex: 200,
        background: 'var(--surface)',
        border: '1px solid var(--border2)',
        borderRadius: 12,
        padding: 16,
        width: 230,
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
      }}
    >
      <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 12 }}>Tweaks</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* Your name */}
        <div>
          <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>Your name</div>
          <input
            value={tweaks.userName}
            onChange={(e) => updateTweak('userName', e.target.value)}
            style={{
              width: '100%',
              background: 'var(--surface2)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              padding: '6px 9px',
              color: 'var(--text)',
              fontSize: 13,
              outline: 'none',
              fontFamily: 'inherit',
            }}
          />
        </div>

        {/* Accent */}
        <div>
          <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>Accent</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="range"
              min={0}
              max={360}
              value={tweaks.accentHue}
              onChange={(e) => updateTweak('accentHue', Number(e.target.value))}
              style={{
                flex: 1,
                accentColor: `oklch(68% 0.16 ${tweaks.accentHue})`,
              }}
            />
            <div
              style={{
                width: 18,
                height: 18,
                borderRadius: '50%',
                background: `oklch(68% 0.16 ${tweaks.accentHue})`,
              }}
            />
          </div>
        </div>

        {/* Theme */}
        <div>
          <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 6 }}>Theme</div>
          <div style={{ display: 'flex', gap: 6 }}>
            {[
              { id: true, l: 'Dark' },
              { id: false, l: 'Light' },
            ].map(({ id, l }) => (
              <button
                key={l}
                onClick={() => updateTweak('darkMode', id)}
                style={{
                  background: tweaks.darkMode === id ? 'var(--accent-dim)' : 'var(--surface2)',
                  border: `1px solid ${tweaks.darkMode === id ? 'var(--accent)' : 'var(--border)'}`,
                  borderRadius: 6,
                  padding: '5px 12px',
                  color: tweaks.darkMode === id ? 'var(--accent)' : 'var(--text3)',
                  fontSize: 12,
                  cursor: 'pointer',
                  fontFamily: 'DM Sans,sans-serif',
                }}
              >
                {l}
              </button>
            ))}
          </div>
        </div>

        {/* Mode */}
        <div>
          <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 6 }}>Mode</div>
          <ModeToggle mode={mode} setMode={setMode} />
        </div>
      </div>
    </div>
  );
}
