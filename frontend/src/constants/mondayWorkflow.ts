/**
 * Messages for the Monday 1h planning stepper. Each is intentionally short and
 * starts with an explicit calendar/scheduling signal so server-side
 * `abuse_calendar_relevance` and intent heuristics accept the request.
 * User-provided text is always prefixed — never send raw long goals alone.
 */
export const MONDAY_WORKFLOW = 'monday' as const;
export type MondayWorkflowId = typeof MONDAY_WORKFLOW;

const LEAD = 'Google Calendar:';

export function mondayMessageLastWeekSummary(): string {
  return (
    `${LEAD} use list_events for the last full week (Mon–Sun, previous week) in my timezone. ` +
    'Give a brief read: what dominated, how busy it felt, any gaps in my schedule.'
  );
}

export function mondayMessageThisWeekConflicts(): string {
  return (
    `${LEAD} use list_events for the rest of this week from today through Sunday in my timezone. ` +
    'Flag overlapping events, risky back-to-backs, and overloaded days.'
  );
}

/** Wraps free-form user goals; keeps calendar on the first line. */
export function mondayMessageAlignGoals(goals: string): string {
  const g = (goals || 'No extra notes.').trim();
  return (
    `Scheduling: map these weekly priorities to my Google Calendar: ${g} ` +
    "Where is space this week, what should I protect, and one calendar change you recommend? Be concise."
  );
}

export function mondayMessageCreateBlock(timeLocal: string, title: string): string {
  const t = timeLocal.trim() || '09:00';
  const name = (title || 'Weekly planning').trim() || 'Weekly planning';
  return (
    `${LEAD} create a 1 hour event next Monday at ${t} in my timezone titled "${name}". ` +
    'If that conflicts, say so and suggest a nearby time.'
  );
}
