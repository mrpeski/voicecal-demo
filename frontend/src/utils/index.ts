// ── ID & date generators ─────────────────────────────────────────────────
export const genId = (): string => Math.random().toString(36).slice(2, 9);

export const todayStr = (): string => new Date().toISOString().slice(0, 10);

export const tomorrowStr = (): string => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
};

export const offsetStr = (n: number): string => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

// ── Display formatters ───────────────────────────────────────────────────
export function formatDate(s: string | null | undefined): string {
  if (!s) return '';
  if (s === todayStr()) return 'Today';
  if (s === tomorrowStr()) return 'Tomorrow';
  return new Date(s + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

export function formatTime(t: string | null | undefined): string {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

// ── Time math ────────────────────────────────────────────────────────────
export function timeToMins(t: string | null | undefined): number {
  if (!t) return 0;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

export function minsToTime(m: number): string {
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

// ── Parsing of AI-generated event blocks ─────────────────────────────────
export interface ParsedEventBlocks {
  creates: Record<string, unknown>[];
  deletes: Record<string, unknown>[];
}

export function parseEventBlocks(text: string): ParsedEventBlocks {
  const creates: Record<string, unknown>[] = [];
  const deletes: Record<string, unknown>[] = [];
  let m;
  const cr = /<create_event>([\s\S]*?)<\/create_event>/g;
  const dr = /<delete_event>([\s\S]*?)<\/delete_event>/g;
  while ((m = cr.exec(text)) !== null) {
    try {
      creates.push(JSON.parse(m[1]));
    } catch {
      /* ignore malformed JSON */
    }
  }
  while ((m = dr.exec(text)) !== null) {
    try {
      deletes.push(JSON.parse(m[1]));
    } catch {
      /* ignore malformed JSON */
    }
  }
  return { creates, deletes };
}

export function cleanText(t: string): string {
  return t
    .replace(/<create_event>[\s\S]*?<\/create_event>/g, '')
    .replace(/<delete_event>[\s\S]*?<\/delete_event>/g, '')
    .trim();
}

// ── Text helpers (Markdown is rendered in ResultCard via `ResultMarkdown`) ─
export function stripMd(t: string): string {
  return t
    .replace(/<[^>]+>/g, '')
    .replace(/\*\*/g, '')
    .replace(/\*/g, '')
    .trim();
}
