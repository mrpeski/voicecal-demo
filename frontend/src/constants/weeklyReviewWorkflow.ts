/**
 * Messages for the Weekly Review stepper. Same pattern as the Monday 1h flow:
 * every message starts with a calendar lead so server-side
 * `abuse_calendar_relevance` and intent heuristics accept the request.
 */
export const WEEKLY_REVIEW_WORKFLOW = 'weekly-review' as const;
export type WeeklyReviewWorkflowId = typeof WEEKLY_REVIEW_WORKFLOW;

const LEAD = 'Google Calendar:';

/**
 * This flow is meant to be run on Saturday or Sunday, looking back at the
 * Mon–Fri work week that just ended (i.e. the most recent Monday through
 * Friday, not the previous calendar week).
 */
export function weeklyReviewMessageLastWeekRecap(): string {
  return (
    `${LEAD} use list_events for the work week that just ended — the most recent Monday through Friday in my timezone (this past Mon–Fri). ` +
    'Summarize what happened: top themes, total meeting load, deepest focus block, and any days that felt overloaded.'
  );
}

export function weeklyReviewMessageTimeBreakdown(): string {
  return (
    `${LEAD} use list_events for the most recent Monday through Friday in my timezone (this past Mon–Fri). ` +
    'Group events into meetings, focus/solo work, and personal. Give rough hours per bucket and one observation about the balance.'
  );
}

/** Wraps user reflection notes; keeps calendar on the first line. */
export function weeklyReviewMessageReflect(notes: string): string {
  const n = (notes || 'No extra notes.').trim();
  return (
    `Scheduling: compare these reflections on this past work week (Mon–Fri just ended) to what was on my Google Calendar: ${n} ` +
    'Where did calendar match reality, where did it not, and one calendar change for next week? Be concise.'
  );
}

export function weeklyReviewMessageCreateBlock(timeLocal: string, title: string): string {
  const t = timeLocal.trim() || '16:00';
  const name = (title || 'Weekly review').trim() || 'Weekly review';
  return (
    `${LEAD} create a 30 minute event next Friday at ${t} in my timezone titled "${name}". ` +
    'If that conflicts, say so and suggest a nearby time.'
  );
}
