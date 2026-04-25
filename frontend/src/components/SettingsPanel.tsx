const INPUT_STYLE = {
  width: '100%',
  background: 'var(--surface2)',
  border: '1px solid var(--border)',
  borderRadius: 7,
  padding: '7px 10px',
  color: 'var(--text)',
  fontSize: 13,
  outline: 'none',
  fontFamily: 'DM Sans,sans-serif',
};

const SECTIONS: SettingsPanelSection[] = [
  {
    section: 'Profile',
    fields: [{ label: 'Your name', key: 'userName', type: 'text', placeholder: 'e.g. Alex' }],
  },
  {
    section: 'Calendar',
    fields: [
      {
        label: 'Timezone',
        key: 'timezone',
        type: 'select',
        options: [
          'Africa/Lagos',
          'America/New_York',
          'America/Chicago',
          'America/Denver',
          'America/Los_Angeles',
          'Europe/London',
          'Europe/Paris',
          'Asia/Tokyo',
          'Australia/Sydney',
        ],
      },
      { label: 'Work hours', key: 'work', type: 'workrange' },
      {
        label: 'Default duration (min)',
        key: 'defaultDuration',
        type: 'number',
        min: 5,
        max: 480,
        step: 5,
      },
    ],
  },
  {
    section: 'Appearance',
    fields: [
      { label: 'Accent color', key: 'accentHue', type: 'hue' },
      { label: 'Theme', key: 'darkMode', type: 'theme' },
    ],
  },
];

function isSettingsKey(key: SettingsPanelField['key']): key is keyof SettingsPanelSettings {
  return key !== 'work';
}

export default function SettingsPanel({ open, onClose, settings, onChange }: SettingsPanelProps) {
  return (
    <>
      {open && (
        <div
          onClick={onClose}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.4)',
            zIndex: 100,
            backdropFilter: 'blur(3px)',
          }}
        />
      )}
      <div
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: 300,
          background: 'var(--surface)',
          borderLeft: '1px solid var(--border)',
          zIndex: 101,
          transform: open ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.3s cubic-bezier(0.32,0,0,1)',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: open ? '-20px 0 60px rgba(0,0,0,0.4)' : 'none',
        }}
      >
        <div
          style={{
            padding: '18px 18px 14px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span style={{ fontWeight: 600, fontSize: 14 }}>Settings</span>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text2)',
              cursor: 'pointer',
              fontSize: 18,
            }}
          >
            ✕
          </button>
        </div>

        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: 18,
            display: 'flex',
            flexDirection: 'column',
            gap: 18,
          }}
        >
          {SECTIONS.map(({ section, fields }) => (
            <div key={section}>
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
                {section}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {fields.map((field) => {
                  if (field.type === 'workrange') {
                    return (
                      <div key={field.key}>
                        <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 5 }}>
                          {field.label}
                        </div>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <input
                            type="time"
                            value={settings.workStart}
                            onChange={(e) => onChange('workStart', e.target.value)}
                            style={{ ...INPUT_STYLE, flex: 1 }}
                          />
                          <span style={{ color: 'var(--text3)', fontSize: 12 }}>–</span>
                          <input
                            type="time"
                            value={settings.workEnd}
                            onChange={(e) => onChange('workEnd', e.target.value)}
                            style={{ ...INPUT_STYLE, flex: 1 }}
                          />
                        </div>
                      </div>
                    );
                  }

                  if (field.type === 'hue') {
                    return (
                      <div key={field.key}>
                        <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 5 }}>
                          {field.label}
                        </div>
                        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                          <input
                            type="range"
                            min={0}
                            max={360}
                            value={settings.accentHue}
                            onChange={(e) => onChange('accentHue', Number(e.target.value))}
                            style={{
                              flex: 1,
                              accentColor: `oklch(68% 0.16 ${settings.accentHue})`,
                            }}
                          />
                          <div
                            style={{
                              width: 22,
                              height: 22,
                              borderRadius: '50%',
                              background: `oklch(68% 0.16 ${settings.accentHue})`,
                              flexShrink: 0,
                            }}
                          />
                        </div>
                      </div>
                    );
                  }

                  if (field.type === 'theme') {
                    return (
                      <div key={field.key}>
                        <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 5 }}>
                          {field.label}
                        </div>
                        <div
                          style={{
                            display: 'flex',
                            background: 'var(--surface2)',
                            border: '1px solid var(--border)',
                            borderRadius: 8,
                            padding: 2,
                            gap: 1,
                            width: 'fit-content',
                          }}
                        >
                          {[
                            { id: true, label: 'Dark' },
                            { id: false, label: 'Light' },
                          ].map(({ id, label }) => (
                            <button
                              key={label}
                              onClick={() => onChange('darkMode', id)}
                              style={{
                                background:
                                  settings.darkMode === id ? 'var(--surface3)' : 'transparent',
                                border: 'none',
                                borderRadius: 6,
                                padding: '5px 14px',
                                color:
                                  settings.darkMode === id ? 'var(--text)' : 'var(--text3)',
                                fontSize: 12,
                                fontWeight: settings.darkMode === id ? 500 : 400,
                                cursor: 'pointer',
                                transition: 'all 0.15s',
                                fontFamily: 'DM Sans,sans-serif',
                              }}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  }

                  if (!isSettingsKey(field.key)) {
                    return null;
                  }

                  const key = field.key;

                  if (field.type === 'text') {
                    return (
                      <div key={key}>
                        <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 5 }}>
                          {field.label}
                        </div>
                        <input
                          value={settings[key] as string}
                          onChange={(e) => onChange(key, e.target.value)}
                          style={INPUT_STYLE}
                          placeholder={field.placeholder}
                        />
                      </div>
                    );
                  }

                  if (field.type === 'number') {
                    return (
                      <div key={key}>
                        <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 5 }}>
                          {field.label}
                        </div>
                        <input
                          type="number"
                          value={settings[key] as number}
                          onChange={(e) => onChange(key, Number(e.target.value))}
                          style={INPUT_STYLE}
                          min={field.min}
                          max={field.max}
                          step={field.step}
                        />
                      </div>
                    );
                  }

                  if (field.type === 'select') {
                    return (
                      <div key={key}>
                        <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 5 }}>
                          {field.label}
                        </div>
                        <select
                          value={settings[key] as string}
                          onChange={(e) => onChange(key, e.target.value)}
                          style={INPUT_STYLE}
                        >
                          {field.options?.map((o) => (
                            <option key={o}>{o}</option>
                          ))}
                        </select>
                      </div>
                    );
                  }

                  return null;
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
