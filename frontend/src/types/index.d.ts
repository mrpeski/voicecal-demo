declare global {
  // ===== App-level shared types =====
  type Mode = 'zen' | 'plan' | 'insights';

  interface VoiceCalEvent {
    id: string;
    title: string;
    date: string;
    startTime?: string;
    endTime?: string;
    description?: string;
    colorIndex: number;
  }

  type VoiceCalTweakSettings = typeof import('../constants').TWEAK_DEFAULTS;

  type VoiceCalResultState = 'thinking' | 'done';

  interface ResultCardEventInfo
    extends Pick<VoiceCalEvent, 'title' | 'date' | 'startTime' | 'endTime' | 'colorIndex'> {}

  type ResultCardState = 'thinking' | 'listening' | 'done';

  interface ToolCallDisplay {
    name: string;
    status: 'running' | 'done' | 'error';
    resultPreview?: string;
  }

  interface ResultCardResult {
    state: ResultCardState;
    transcript?: string;
    text?: string;
    newEvents?: ResultCardEventInfo[];
    toolCalls?: ToolCallDisplay[];
  }

  interface VoiceCalQueryData {
    state: VoiceCalResultState;
    transcript?: string;
    text?: string;
    newEvents?: ResultCardEventInfo[];
    toolCalls?: ToolCallDisplay[];
  }

  type VoiceCalQueryResult = VoiceCalQueryData | null;

  // ===== ZenView =====
  interface ZenViewEvent extends VoiceCalEvent {
    attendees?: string[];
  }

  type ZenViewTweaks = VoiceCalTweakSettings & Record<string, string | number | boolean>;

  interface ZenViewProps {
    tweaks: ZenViewTweaks;
    result: ResultCardResult | null;
    onDismissResult: () => void;
    listening: boolean;
    onMicClick: () => void;
    onSend: (message: string) => void;
    upcomingEvents: ZenViewEvent[];
    onDeleteEvent: (eventId: string) => void;
    /** Bumped to request focus + prefill of the text input. */
    typeRequest?: { value: string; nonce: number } | null;
    onTypeRequestHandled?: () => void;
  }

  // ===== Waveform =====
  interface WaveformProps {
    active: boolean;
  }

  // ===== SettingsPanel =====
  type SettingsPanelSettings = VoiceCalTweakSettings;

  type SettingsPanelFieldType = 'text' | 'number' | 'select' | 'workrange' | 'hue' | 'theme';

  interface SettingsPanelField {
    label: string;
    key: keyof SettingsPanelSettings | 'work';
    type: SettingsPanelFieldType;
    placeholder?: string;
    options?: string[];
    min?: number;
    max?: number;
    step?: number;
  }

  interface SettingsPanelSection {
    section: string;
    fields: SettingsPanelField[];
  }

  interface SettingsPanelProps {
    open: boolean;
    onClose: () => void;
    settings: SettingsPanelSettings;
    onChange: (key: keyof SettingsPanelSettings, value: string | number | boolean) => void;
  }

  // ===== PlanView =====
  interface PlanViewEvent extends VoiceCalEvent {}

  type PlanViewTweaks = Pick<VoiceCalTweakSettings, 'workStart' | 'workEnd' | 'userName'>;

  interface PlanViewProps {
    events: PlanViewEvent[];
    onQuery: (prompt: string, label: string) => void;
    result?: ResultCardResult;
    onDismissResult: () => void;
    onDeleteEvent: (eventId: string) => void;
    tweaks: PlanViewTweaks;
  }

  // ===== InsightsView =====
  interface InsightsEvent extends Pick<VoiceCalEvent, 'title' | 'date' | 'startTime' | 'endTime'> {}

  type InsightsTweaks = Pick<VoiceCalTweakSettings, 'userName' | 'workStart' | 'workEnd'>;

  interface InsightsStatCard {
    label: string;
    value: string | number;
    sub: string;
  }

  interface InsightsViewProps {
    events: InsightsEvent[];
    tweaks: InsightsTweaks;
    onQuery: (prompt: string, label: string) => void;
    result?: ResultCardResult | null;
    onDismissResult: () => void;
  }

  // ===== Header =====
  interface HeaderProps {
    mode: Mode;
    setMode: (mode: Mode) => void;
    darkMode: boolean;
    onToggleDarkMode: () => void;
    speaking: boolean;
    onStopSpeaking: () => void;
    onOpenSettings: () => void;
  }

  // ===== ModeToggle =====
  interface ModeToggleProps {
    mode: Mode;
    setMode: (mode: Mode) => void;
  }

  // ===== EditModeTweaks =====
  type EditModeTweaksState = Pick<VoiceCalTweakSettings, 'userName' | 'accentHue' | 'darkMode'>;

  interface EditModeTweaksProps {
    tweaks: EditModeTweaksState;
    updateTweak: <K extends keyof EditModeTweaksState>(key: K, value: EditModeTweaksState[K]) => void;
    mode: Mode;
    setMode: (mode: Mode) => void;
  }

  // ===== ResultCard =====
  interface ResultCardProps {
    result: ResultCardResult | null;
    onDismiss?: () => void;
  }

  interface ClaudeClient {
    complete: (payload: unknown) => Promise<string>;
  }

  interface Window {
    claude: ClaudeClient;
  }
}

export {};
