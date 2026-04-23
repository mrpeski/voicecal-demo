# VoiceCal — extracted structure

The original single-file `index.html` has been split into modules. Drop
`src/` into a Vite / CRA / Next project and the entry point is
`src/main.jsx`.

## Tree

```
src/
├── main.jsx                      # ReactDOM.createRoot entry
├── App.jsx                       # Top-level orchestration + AI query handler
├── styles/
│   └── global.css                # CSS variables, reset, animations, font import
├── constants/
│   └── index.js                  # COLORS, DAYS, TWEAK_DEFAULTS, INITIAL_EVENTS,
│                                 # PRESET_GROUPS, SMART_PROMPTS, DISCOVERY_PROMPTS
├── utils/
│   ├── index.js                  # date/time helpers, parseEventBlocks, md helpers
│   └── theme.js                  # applyTheme(dark, hue)
├── hooks/
│   ├── usePersistentState.js     # useState + localStorage sync
│   ├── useSpeechRecognition.js   # wraps window.SpeechRecognition
│   └── useSpeechSynthesis.js     # wraps window.speechSynthesis
└── components/
    ├── Header.jsx                # top bar (mode toggle, theme, speaker, settings)
    ├── ModeToggle.jsx            # Zen / Plan / Insights segmented control
    ├── Waveform.jsx              # animated mic waveform
    ├── ResultCard.jsx            # thinking / listening / done state card
    ├── ZenView.jsx               # voice-first landing view
    ├── PlanView.jsx              # today list + prompt library
    ├── InsightsView.jsx          # stats, bar chart, AI pattern analysis
    ├── SettingsPanel.jsx         # slide-out settings drawer
    └── EditModeTweaks.jsx        # floating tweaks panel (edit-mode bridge)
```

## Notes on the refactor

- **All inline `<style>` rules** (keyframes, focus styles, scrollbar) were
  moved into `styles/global.css`. The dynamic CSS variable writes live in
  `utils/theme.js` since they depend on runtime state.
- **`TWEAK_DEFAULTS`** still includes the `/*EDITMODE-BEGIN*/ … /*EDITMODE-END*/`
  comment markers so any existing edit-mode tooling that targets them
  continues to work.
- **localStorage keys** (`vc_tweaks3`, `vc_events2`, `vc_mode`) are
  unchanged, so an existing user's stored state carries over.
- **`usePersistentState`** replaces the three duplicated
  `useEffect(() => localStorage.setItem(…))` blocks in the original.
- **Speech recognition and synthesis** are isolated into hooks so the
  View components don't touch `window.*` APIs directly.
- **`window.claude.complete`** calls still live in `App.jsx` (main
  processQuery) and `InsightsView.jsx` (analysis + discovery prompts)
  since each uses a distinct system prompt.
- **No behavioral changes** — the UI and interactions are identical to
  the original.
