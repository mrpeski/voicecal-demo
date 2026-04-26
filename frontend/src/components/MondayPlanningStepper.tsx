import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import {
  mondayMessageAlignGoals,
  mondayMessageCreateBlock,
  mondayMessageLastWeekSummary,
  mondayMessageThisWeekConflicts,
} from '../constants/mondayWorkflow';

const STEPS = 5;

type MondayPlanningStepperProps = {
  open: boolean;
  onClose: () => void;
  onSend: (message: string, displayLabel: string) => void;
  agentBusy: boolean;
  defaultEventTime: string;
};

export default function MondayPlanningStepper({
  open,
  onClose,
  onSend,
  agentBusy,
  defaultEventTime,
}: MondayPlanningStepperProps) {
  const [step, setStep] = useState(1);
  const [goals, setGoals] = useState('');
  const [blockTitle, setBlockTitle] = useState('Weekly planning');
  const [blockTime, setBlockTime] = useState(defaultEventTime);
  const goalsId = useId();
  const titleId = useId();
  const timeId = useId();
  const wasOpen = useRef(false);

  // Fresh form only when the panel opens (not on every re-render while open).
  useEffect(() => {
    if (open && !wasOpen.current) {
      setStep(1);
      setGoals('');
      setBlockTitle('Weekly planning');
      setBlockTime(defaultEventTime);
    }
    wasOpen.current = open;
  }, [open, defaultEventTime]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      style={{
        background: 'var(--surface2)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: '16px 16px 14px',
        position: 'relative',
      }}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close planning workflow"
        style={{
          position: 'absolute',
          top: 10,
          right: 10,
          width: 28,
          height: 28,
          border: 'none',
          borderRadius: 6,
          background: 'var(--surface)',
          color: 'var(--text2)',
          cursor: 'pointer',
          fontSize: 14,
          lineHeight: 1,
        }}
      >
        ✕
      </button>

      <div
        style={{
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'var(--text3)',
          marginBottom: 4,
        }}
      >
        Guided flow · {step} / {STEPS}
      </div>
      <div
        style={{
          fontSize: 16,
          fontWeight: 600,
          color: 'var(--text)',
          marginBottom: 12,
          fontFamily: 'DM Sans, sans-serif',
        }}
      >
        Monday 1h weekly planning
      </div>
      <p
        style={{
          fontSize: 12,
          lineHeight: 1.5,
          color: 'var(--text2)',
          margin: '0 0 16px 0',
          maxWidth: 400,
        }}
      >
        Each step sends a short, calendar-tied message so scheduling guardrails
        pass. After you run a step, the answer shows in the result card below
        this panel. Read it, then use “Next step” (or “Back”).
      </p>

      {/* Step 1 */}
      {step === 1 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label htmlFor={goalsId} style={{ fontSize: 12, color: 'var(--text2)' }}>
            What are your top 1–3 goals or priorities for this week?
          </label>
          <textarea
            id={goalsId}
            value={goals}
            onChange={(e) => setGoals(e.target.value)}
            rows={4}
            placeholder="e.g. Ship the beta, make time for exercise, no meetings after 5pm on Friday…"
            style={{
              width: '100%',
              boxSizing: 'border-box',
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 10,
              padding: '10px 12px',
              color: 'var(--text)',
              fontSize: 13,
              fontFamily: 'DM Sans, sans-serif',
              resize: 'vertical',
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <NextButton
              onClick={() => setStep(2)}
              label="Next"
              disabled={false}
            />
          </div>
        </div>
      )}

      {step === 2 && (
        <StepBlock
          title="Last week · calendar read"
          body="Tap the green “Run last week review” button once. The assistant fetches your Google Calendar for the last full week (Mon–Sun) and answers in the result card below with a short recap: what used your time, how busy the week was, and gaps. When you are done reading, use “Next step”."
        >
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-end' }}>
            <GhostButton
              onClick={() => setStep(1)}
              label="Back"
            />
            <ActionButton
              onClick={() => onSend(mondayMessageLastWeekSummary(), 'Planning · last week')}
              label="Run last week review"
              disabled={agentBusy}
            />
            <NextButton
              onClick={() => setStep(3)}
              label="Next step"
            />
          </div>
        </StepBlock>
      )}

      {step === 3 && (
        <StepBlock
          title="This week"
          body="List what’s on your schedule and surface conflicts, tight chains of meetings, and heavy days."
        >
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-end' }}>
            <GhostButton
              onClick={() => setStep(2)}
              label="Back"
            />
            <ActionButton
              onClick={() => onSend(mondayMessageThisWeekConflicts(), 'Planning · this week’s schedule')}
              label="Run this week scan"
              disabled={agentBusy}
            />
            <NextButton
              onClick={() => setStep(4)}
              label="Next step"
            />
          </div>
        </StepBlock>
      )}

      {step === 4 && (
        <StepBlock
          title="Connect goals to the calendar"
          body="Sends the goals you wrote in step 1 with an explicit Google Calendar request."
        >
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-end' }}>
            <GhostButton
              onClick={() => setStep(3)}
              label="Back"
            />
            <ActionButton
              onClick={() => onSend(mondayMessageAlignGoals(goals), 'Planning · align goals + calendar')}
              label="Run alignment"
              disabled={agentBusy}
            />
            <NextButton
              onClick={() => setStep(5)}
              label="Next step"
            />
          </div>
        </StepBlock>
      )}

      {step === 5 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p
            style={{
              fontSize: 12,
              lineHeight: 1.5,
              color: 'var(--text2)',
              margin: 0,
            }}
          >
            Optional: add a 1 hour “weekly planning” block on next Monday (local time).
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div>
              <label htmlFor={timeId} style={{ fontSize: 11, color: 'var(--text3)' }}>
                Start (local)
              </label>
              <input
                id={timeId}
                value={blockTime}
                onChange={(e) => setBlockTime(e.target.value)}
                type="time"
                style={{
                  width: '100%',
                  marginTop: 4,
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  padding: '6px 8px',
                  color: 'var(--text)',
                  fontSize: 13,
                }}
              />
            </div>
            <div>
              <label htmlFor={titleId} style={{ fontSize: 11, color: 'var(--text3)' }}>
                Event title
              </label>
              <input
                id={titleId}
                value={blockTitle}
                onChange={(e) => setBlockTitle(e.target.value)}
                type="text"
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  marginTop: 4,
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  padding: '6px 8px',
                  color: 'var(--text)',
                  fontSize: 13,
                }}
              />
            </div>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-end' }}>
            <GhostButton
              onClick={() => setStep(4)}
              label="Back"
            />
            <button
              type="button"
              onClick={onClose}
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                color: 'var(--text2)',
                borderRadius: 8,
                padding: '8px 14px',
                fontSize: 12,
                cursor: 'pointer',
                fontFamily: 'DM Sans, sans-serif',
              }}
            >
              Skip · done
            </button>
            <ActionButton
              onClick={() =>
                onSend(
                  mondayMessageCreateBlock(blockTime, blockTitle),
                  `Planning · add ${blockTitle} Monday`,
                )
              }
              label="Create on calendar"
              disabled={agentBusy}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function StepBlock({
  title,
  body,
  children,
}: {
  title: string;
  body: string;
  children: ReactNode;
}) {
  return (
    <div>
      <div
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: 'var(--text)',
          marginBottom: 6,
          fontFamily: 'DM Sans, sans-serif',
        }}
      >
        {title}
      </div>
      <p
        style={{
          fontSize: 12,
          lineHeight: 1.5,
          color: 'var(--text2)',
          margin: '0 0 12px 0',
        }}
      >
        {body}
      </p>
      {children}
    </div>
  );
}

function ActionButton({
  onClick,
  label,
  disabled,
}: {
  onClick: () => void;
  label: string;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        background: disabled ? 'var(--surface2)' : 'var(--accent)',
        color: disabled ? 'var(--text3)' : '#fff',
        border: 'none',
        borderRadius: 8,
        padding: '8px 14px',
        fontSize: 12,
        fontWeight: 600,
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontFamily: 'DM Sans, sans-serif',
      }}
    >
      {label}
    </button>
  );
}

function NextButton({
  onClick,
  label,
  disabled,
}: {
  onClick: () => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border2)',
        color: 'var(--text)',
        borderRadius: 8,
        padding: '8px 14px',
        fontSize: 12,
        cursor: disabled ? 'not-allowed' : 'default',
        fontFamily: 'DM Sans, sans-serif',
      }}
    >
      {label}
    </button>
  );
}

function GhostButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: 'none',
        border: '1px solid transparent',
        color: 'var(--text2)',
        borderRadius: 8,
        padding: '8px 8px',
        fontSize: 12,
        cursor: 'pointer',
        fontFamily: 'DM Sans, sans-serif',
      }}
    >
      {label}
    </button>
  );
}
