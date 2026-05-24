import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import {
  weeklyReviewMessageCreateBlock,
  weeklyReviewMessageLastWeekRecap,
  weeklyReviewMessageReflect,
  weeklyReviewMessageTimeBreakdown,
} from '../constants/weeklyReviewWorkflow';

const STEPS = 5;

type WeeklyReviewStepperProps = {
  open: boolean;
  onClose: () => void;
  onSend: (message: string, displayLabel: string) => void;
  agentBusy: boolean;
  defaultEventTime: string;
};

export default function WeeklyReviewStepper({
  open,
  onClose,
  onSend,
  agentBusy,
  defaultEventTime,
}: WeeklyReviewStepperProps) {
  const [step, setStep] = useState(1);
  const [notes, setNotes] = useState('');
  const [blockTitle, setBlockTitle] = useState('Weekly review');
  const [blockTime, setBlockTime] = useState(defaultEventTime);
  const notesId = useId();
  const titleId = useId();
  const timeId = useId();
  const wasOpen = useRef(false);

  useEffect(() => {
    if (open && !wasOpen.current) {
      setStep(1);
      setNotes('');
      setBlockTitle('Weekly review');
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
        aria-label="Close weekly review workflow"
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
        Weekly review · this past Mon–Fri
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
          <label htmlFor={notesId} style={{ fontSize: 12, color: 'var(--text2)' }}>
            Best done Sat/Sun. What stood out about this past Mon–Fri? Wins, frustrations, anything that surprised you.
          </label>
          <textarea
            id={notesId}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}
            placeholder="e.g. Shipped the beta on Wed, too many context switches Thu, skipped exercise twice…"
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
          title="Mon–Fri · recap"
          body="Tap “Run recap”. The assistant fetches the most recent Mon–Fri from Google Calendar and answers below: top themes, total meeting load, deepest focus block, and any overloaded days."
        >
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-end' }}>
            <GhostButton onClick={() => setStep(1)} label="Back" />
            <ActionButton
              onClick={() => onSend(weeklyReviewMessageLastWeekRecap(), 'Review · last week recap')}
              label="Run recap"
              disabled={agentBusy}
            />
            <NextButton onClick={() => setStep(3)} label="Next step" />
          </div>
        </StepBlock>
      )}

      {step === 3 && (
        <StepBlock
          title="Time breakdown"
          body="Group this past Mon–Fri into meetings, focus/solo work, and personal. Rough hours per bucket and one observation about balance."
        >
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-end' }}>
            <GhostButton onClick={() => setStep(2)} label="Back" />
            <ActionButton
              onClick={() => onSend(weeklyReviewMessageTimeBreakdown(), 'Review · time breakdown')}
              label="Run breakdown"
              disabled={agentBusy}
            />
            <NextButton onClick={() => setStep(4)} label="Next step" />
          </div>
        </StepBlock>
      )}

      {step === 4 && (
        <StepBlock
          title="Reflect → next week"
          body="Sends your notes from step 1 with an explicit calendar compare: where the calendar matched reality, where it didn’t, and one change to make."
        >
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-end' }}>
            <GhostButton onClick={() => setStep(3)} label="Back" />
            <ActionButton
              onClick={() => onSend(weeklyReviewMessageReflect(notes), 'Review · reflect + change')}
              label="Run reflection"
              disabled={agentBusy}
            />
            <NextButton onClick={() => setStep(5)} label="Next step" />
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
            Optional: add a 30 minute “weekly review” block on next Friday (local time).
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
            <GhostButton onClick={() => setStep(4)} label="Back" />
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
                  weeklyReviewMessageCreateBlock(blockTime, blockTitle),
                  `Review · add ${blockTitle} Friday`,
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
