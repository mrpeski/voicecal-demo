// ── Color palette for event dots ─────────────────────────────────────────
export const COLORS = [
  'oklch(68% 0.16 255)',
  'oklch(68% 0.14 155)',
  'oklch(68% 0.16 300)',
  'oklch(72% 0.15 60)',
  'oklch(68% 0.17 200)',
  'oklch(65% 0.18 20)',
] as const;

export type Color = (typeof COLORS)[number];

// ── Day labels (Sun-first for JS getDay()) ───────────────────────────────
export const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

export type Day = (typeof DAYS)[number];

// ── Tweak defaults (edit-mode template) ──────────────────────────────────
export const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/ {
  accentHue: 344,
  userName: 'User',
  timezone: 'America/New_York',
  workStart: '09:00',
  workEnd: '17:00',
  defaultDuration: 60,
  darkMode: true,
} /*EDITMODE-END*/;

export interface TweakDefaults {
  accentHue: number;
  userName: string;
  timezone: string;
  workStart: string;
  workEnd: string;
  defaultDuration: number;
  darkMode: boolean;
}

// ── Helper for initial event seed dates ──────────────────────────────────
const todayStr = () => new Date().toISOString().slice(0, 10);
const tomorrowStr = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
};
const offsetStr = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

// ── Seed events shown on first load ──────────────────────────────────────
export interface CalendarEvent {
  id: string;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  description: string;
  colorIndex: number;
}

export const INITIAL_EVENTS: CalendarEvent[] = [
  {
    id: 'e1',
    title: 'Team Standup',
    date: todayStr(),
    startTime: '09:00',
    endTime: '09:30',
    description: '',
    colorIndex: 0,
  },
  {
    id: 'e2',
    title: 'Deep Work',
    date: todayStr(),
    startTime: '10:00',
    endTime: '12:00',
    description: 'Focus block',
    colorIndex: 4,
  },
  {
    id: 'e3',
    title: 'Product Review',
    date: tomorrowStr(),
    startTime: '14:00',
    endTime: '15:00',
    description: 'Q2 roadmap',
    colorIndex: 2,
  },
  {
    id: 'e4',
    title: '1:1 with Manager',
    date: offsetStr(3),
    startTime: '11:00',
    endTime: '11:30',
    description: '',
    colorIndex: 0,
  },
];

// ── Preset prompt groups for Plan view ───────────────────────────────────
export interface PromptItem {
  label: string;
  prompt: string;
}

export interface PromptGroup {
  label: string;
  items: PromptItem[];
}

export const PRESET_GROUPS: PromptGroup[] = [
  {
    label: 'Work',
    items: [
      { label: 'Focus block', prompt: 'Block 2 hours for deep focus work tomorrow morning' },
      { label: 'Team meeting', prompt: 'Schedule a 30-minute team meeting tomorrow at 10am' },
      { label: 'Review session', prompt: 'Schedule a 1-hour review session tomorrow afternoon' },
      { label: '1:1', prompt: 'Add a 30-minute 1:1 tomorrow at 2pm' },
    ],
  },
  {
    label: 'Personal',
    items: [
      { label: 'Workout', prompt: 'Schedule a 1-hour workout tomorrow at 7am' },
      { label: 'Lunch', prompt: 'Block lunch today at 12:30pm for 1 hour' },
      { label: 'Coffee catch-up', prompt: 'Schedule a coffee catch-up tomorrow at 9am for 30 minutes' },
      { label: 'Errand', prompt: 'Block 45 minutes for errands tomorrow afternoon' },
    ],
  },
  {
    label: 'Tonight',
    items: [
      {
        label: 'Movie night',
        prompt:
          'What are some great movies to watch tonight? Schedule a movie night at 8pm for 2 hours and suggest 3 films worth watching right now.',
      },
      {
        label: 'New show',
        prompt:
          'Recommend a TV show to start tonight. Schedule "Show night" at 8pm for 2 hours and tell me why it\'s worth watching.',
      },
      { label: 'Dinner', prompt: 'Schedule dinner tonight at 7pm for 1 hour' },
      { label: 'Wind down', prompt: 'Schedule wind-down time tonight at 9:30pm for 30 minutes' },
    ],
  },
  {
    label: 'Weekend',
    items: [
      {
        label: 'Day trip',
        prompt: 'Suggest a fun day trip or outing this weekend and block Saturday 10am–6pm for it.',
      },
      { label: 'Meal prep', prompt: 'Schedule 2 hours for meal prep this Sunday at 4pm' },
      {
        label: 'Social hangout',
        prompt: 'Schedule a social hangout this Saturday evening at 7pm for 3 hours',
      },
      { label: 'Rest day', prompt: 'Block Sunday as a rest day — no events, just recovery' },
    ],
  },
];

// ── Smart prompts shown prominently in Plan view ─────────────────────────
export interface SmartPrompt {
  label: string;
  prompt: string;
}

export const SMART_PROMPTS: SmartPrompt[] = [
  {
    label: 'Plan my evening',
    prompt:
      "Based on my calendar today, what's a good way to spend my evening? Suggest 2–3 options and optionally schedule the best one.",
  },
  {
    label: "What's free today?",
    prompt:
      "Looking at today's events, tell me what time blocks are free and suggest the best one for focus work.",
  },
  {
    label: 'Suggest something to watch',
    prompt:
      "Suggest 3 specific movies or TV shows worth watching right now — mix of genres. Be specific with titles and a one-line reason each. Then schedule 'Movie night' tonight at 8pm.",
  },
  {
    label: 'Optimize my day',
    prompt:
      'Look at my schedule and suggest one thing I should move, remove, or add to make today more productive and balanced.',
  },
];

// ── Discovery prompts shown in Insights view ─────────────────────────────
export const DISCOVERY_PROMPTS: SmartPrompt[] = [
  {
    label: 'Best focus time?',
    prompt:
      'Based on my schedule patterns, when is my best window for uninterrupted deep work? Consider my existing events and work hours.',
  },
  {
    label: 'Am I overbooked?',
    prompt:
      "Analyze my calendar and tell me if I'm at risk of burnout or over-scheduling. Be honest and specific.",
  },
  {
    label: 'What am I neglecting?',
    prompt:
      'Looking at my calendar, what types of activities (exercise, social time, learning, rest) seem underrepresented? Suggest one thing to add this week.',
  },
  {
    label: 'Suggest a habit block',
    prompt:
      'Based on my free time patterns, suggest a daily habit I could schedule. Give me a specific time and duration that would fit my existing calendar.',
  },
];
