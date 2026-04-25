import { DAYS, DISCOVERY_PROMPTS } from '../constants';
import { todayStr, offsetStr, timeToMins } from '../utils';
import ResultCard from './ResultCard';

export default function InsightsView({
  events,
  tweaks,
  onQuery,
  result,
  onDismissResult,
}: InsightsViewProps) {
  const today = new Date();
  const todayDow = today.getDay();
  const loading = result?.state === 'thinking';

  // Events per day of week (across all events)
  const byDow = DAYS.map(
    (_, d) => events.filter((e) => new Date(e.date + 'T00:00:00').getDay() === d).length
  );
  const maxDow = Math.max(...byDow, 1);

  // Events this week
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - todayDow);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  const ws = weekStart.toISOString().slice(0, 10);
  const we = weekEnd.toISOString().slice(0, 10);
  const thisWeekEvs = events.filter((e) => e.date >= ws && e.date <= we);

  // Free hours today (within work hours)
  const todayEvs = events
    .filter((e) => e.date === todayStr() && e.startTime && e.endTime)
    .sort((a, b) => timeToMins(a.startTime!) - timeToMins(b.startTime!));
  const workStart = timeToMins(tweaks.workStart);
  const workEnd = timeToMins(tweaks.workEnd);
  let freeMin = 0;
  let cursor = workStart;
  for (const ev of todayEvs) {
    if (timeToMins(ev.startTime!) > cursor) freeMin += timeToMins(ev.startTime!) - cursor;
    cursor = Math.max(cursor, timeToMins(ev.endTime!));
  }
  if (cursor < workEnd) freeMin += workEnd - cursor;
  const freeHrs = (freeMin / 60).toFixed(1);
  const busyHrs = ((workEnd - workStart - freeMin) / 60).toFixed(1);

  // Busiest day of week
  const busiestDow = byDow.indexOf(Math.max(...byDow));

  // Consecutive-day streak starting today
  let streak = 0;
  for (let i = 0; i < 14; i++) {
    if (events.some((e) => e.date === offsetStr(i))) streak++;
    else break;
  }

  function eventsContext(): string {
    const dateStr = today.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    const trimmed = events
      .slice()
      .sort((a, b) => (a.date + (a.startTime ?? '')).localeCompare(b.date + (b.startTime ?? '')))
      .slice(0, 60)
      .map(({ title, date, startTime, endTime }) => ({ title, date, startTime, endTime }));
    return `Today is ${dateStr}. User: ${tweaks.userName}. Events (JSON): ${JSON.stringify(trimmed)}`;
  }

  function runAnalyzeSchedule() {
    if (loading) return;
    const prompt = `${eventsContext()}

You are a calendar analyst. Give 3 short, specific, actionable insights about this person's schedule patterns. Focus on: balance, recurring gaps, over-scheduling risks, or opportunities. Each insight should be 1-2 sentences. Format as a numbered list. Be direct and specific — avoid generic advice.`;
    onQuery(prompt, 'Analyze my schedule');
  }

  function runDiscoveryPrompt(d: { prompt: string; label: string }) {
    if (loading) return;
    const prompt = `${eventsContext()}

Be specific and direct. 2-3 sentences max.

${d.prompt}`;
    onQuery(prompt, d.label);
  }

  const statCards: InsightsStatCard[] = [
    { label: 'Free today', value: `${freeHrs}h`, sub: `${busyHrs}h busy` },
    { label: 'This week', value: thisWeekEvs.length, sub: 'events scheduled' },
    { label: 'Busiest day', value: DAYS[busiestDow], sub: `${byDow[busiestDow]} events avg` },
    { label: 'Streak', value: `${streak}d`, sub: 'days with events' },
  ];

  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>
      <div
        style={{
          maxWidth: 440,
          width: '100%',
          margin: '0 auto',
          padding: '20px 20px 32px',
          display: 'flex',
          flexDirection: 'column',
          gap: 20,
        }}
      >
        {/* Stat cards */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {statCards.map(({ label, value, sub }) => (
            <div
              key={label}
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 12,
                padding: '12px 14px',
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  color: 'var(--text3)',
                  marginBottom: 4,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  fontWeight: 600,
                }}
              >
                {label}
              </div>
              <div
                style={{
                  fontSize: 22,
                  fontWeight: 600,
                  color: 'var(--text)',
                  letterSpacing: '-0.02em',
                }}
              >
                {value}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>{sub}</div>
            </div>
          ))}
        </div>

        {/* Day-of-week bar chart */}
        <div
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            padding: '14px 16px',
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: 'var(--text3)',
              marginBottom: 12,
            }}
          >
            Events by day
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 52 }}>
            {DAYS.map((d, i) => {
              const h = Math.max((byDow[i] / maxDow) * 44, 2);
              const isToday = i === todayDow;
              return (
                <div
                  key={d}
                  style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <div
                    style={{
                      width: '100%',
                      height: h,
                      background: isToday ? 'var(--accent)' : 'var(--surface3)',
                      borderRadius: 4,
                      transition: 'height 0.4s ease',
                    }}
                  />
                  <div
                    style={{
                      fontSize: 9,
                      color: isToday ? 'var(--accent)' : 'var(--text3)',
                      fontWeight: isToday ? 600 : 400,
                    }}
                  >
                    {d}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* AI pattern analysis */}
        <div>
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: 'var(--text3)',
              marginBottom: 10,
            }}
          >
            Pattern analysis
          </div>
          {result ? (
            <ResultCard
              result={result}
              onDismiss={result.state === 'done' ? onDismissResult : undefined}
            />
          ) : (
            <button
              onClick={runAnalyzeSchedule}
              disabled={loading}
              style={{
                width: '100%',
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 12,
                padding: '13px 16px',
                cursor: loading ? 'default' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                transition: 'border-color 0.15s, background 0.15s',
              }}
              onMouseEnter={(e) => {
                if (!loading) {
                  e.currentTarget.style.borderColor = 'var(--border2)';
                  e.currentTarget.style.background = 'var(--surface2)';
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--border)';
                e.currentTarget.style.background = 'var(--surface)';
              }}
            >
              <span
                style={{ fontSize: 13, color: 'var(--text)', fontFamily: 'DM Sans,sans-serif' }}
              >
                {loading ? 'Analyzing your patterns…' : 'Analyze my schedule'}
              </span>
              {loading ? (
                <div style={{ display: 'flex', gap: 3 }}>
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      style={{
                        width: 4,
                        height: 4,
                        borderRadius: '50%',
                        background: 'var(--text3)',
                        display: 'inline-block',
                        animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite`,
                      }}
                    />
                  ))}
                </div>
              ) : (
                <span style={{ fontSize: 12, color: 'var(--accent)' }}>Generate →</span>
              )}
            </button>
          )}
        </div>

        {/* Discovery prompts */}
        <div>
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: 'var(--text3)',
              marginBottom: 10,
            }}
          >
            Discover
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {DISCOVERY_PROMPTS.map((d, i) => (
              <button
                key={i}
                onClick={() => runDiscoveryPrompt(d)}
                disabled={loading}
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 10,
                  padding: '10px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                  textAlign: 'left',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'var(--border2)';
                  e.currentTarget.style.background = 'var(--surface2)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--border)';
                  e.currentTarget.style.background = 'var(--surface)';
                }}
              >
                <span
                  style={{ fontSize: 13, color: 'var(--text)', fontFamily: 'DM Sans,sans-serif' }}
                >
                  {d.label}
                </span>
                <span style={{ fontSize: 11, color: 'var(--text3)' }}>→</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
