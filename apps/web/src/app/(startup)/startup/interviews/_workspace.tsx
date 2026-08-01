'use client';

import { useState, useTransition } from 'react';
import { CircleDot, MapPin, Mic, Sparkles, TriangleAlert, Video } from 'lucide-react';
import type { StartupInterviewView } from '@relayflow/logic';
import {
  Badge,
  Button,
  Panel,
  PanelHeader,
  TextAreaField,
  cn,
} from '@relayflow/ui-web';
import { attachRecordingAction, saveInterviewFeedbackAction } from '@/server/actions';

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  });

const RECOMMENDATIONS = [
  { value: 'advance', label: 'Advance', tone: 'positive' },
  { value: 'undecided', label: 'Undecided', tone: 'neutral' },
  { value: 'reject', label: 'Reject', tone: 'critical' },
] as const;

/**
 * The interview workspace.
 *
 * The layout separates two things that must never blur together: what the model
 * produced, and what the interviewer decided. The AI summary sits in its own
 * panel, labelled and visually distinct; the verdict is a form beneath it that
 * only a person fills in. A hiring decision attributed to a summariser is one
 * nobody can defend when the candidate asks why.
 *
 * Transcription failure is shown as a state, not an absence. "No summary yet"
 * and "the transcription failed" require different actions, and a UI that
 * renders both as empty space tells you nothing.
 */
export function InterviewWorkspace({ view }: { view: StartupInterviewView }) {
  const { interview, candidate, position } = view;
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [feedback, setFeedback] = useState(interview.feedback ?? '');
  const [recommendation, setRecommendation] = useState<string>(
    interview.recommendation ?? 'undecided',
  );

  const record = () => {
    setError(null);
    startTransition(async () => {
      const result = await attachRecordingAction({
        interviewId: interview.id,
        recordingUrl: `https://recordings.example/${interview.id}.m4a`,
      });
      if (!result.ok) setError(result.message);
    });
  };

  const save = () => {
    setError(null);
    startTransition(async () => {
      const result = await saveInterviewFeedbackAction({
        interviewId: interview.id,
        feedback,
        recommendation,
      });
      if (!result.ok) setError(result.message);
    });
  };

  return (
    <Panel>
      <PanelHeader
        title={candidate?.fullName ?? 'Candidate'}
        aside={
          <>
            {!view.candidateStillAvailable && <Badge tone="critical">no longer available</Badge>}
            <Badge tone={interview.status === 'completed' ? 'positive' : 'info'}>
              {interview.status.replace('_', ' ')}
            </Badge>
          </>
        }
      />

      <div className="flex flex-col gap-4 p-5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-text-secondary">
          <span className="font-medium text-text">{position?.title ?? 'Role'}</span>
          {interview.scheduledFor && (
            <span className="tabular-nums">{when(interview.scheduledFor)}</span>
          )}
          {interview.durationMinutes && <span>{interview.durationMinutes} min</span>}
          {interview.location && (
            <span className="flex items-center gap-1">
              {interview.mode === 'online' ? (
                <>
                  <Video className="size-3" aria-hidden="true" />
                  <a href={interview.location} className="text-accent hover:underline">
                    Join meeting
                  </a>
                </>
              ) : (
                <>
                  <MapPin className="size-3" aria-hidden="true" />
                  {interview.location}
                </>
              )}
            </span>
          )}
        </div>

        {/* Recording and transcription — a pipeline with states, not a boolean. */}
        <div className="rounded-md bg-surface-sunken px-2.5 py-2">
          {interview.transcriptStatus === 'none' && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm text-text-secondary">
                No recording yet. Record the interview to get a transcript and notes.
              </span>
              <Button size="xs" variant="secondary" disabled={pending} onClick={record}>
                <Mic className="size-3" />
                {pending ? 'Processing…' : 'Record interview'}
              </Button>
            </div>
          )}

          {interview.transcriptStatus === 'processing' && (
            <span className="flex items-center gap-1.5 text-sm text-info-text">
              <CircleDot className="size-3 animate-pulse motion-reduce:animate-none" />
              Transcribing. This usually takes a few minutes.
            </span>
          )}

          {interview.transcriptStatus === 'failed' && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-sm text-warning-text">
                <TriangleAlert className="size-3.5 shrink-0" aria-hidden="true" />
                Transcription failed. The recording is still available.
              </span>
              <Button size="xs" variant="secondary" disabled={pending} onClick={record}>
                Try again
              </Button>
            </div>
          )}

          {interview.transcriptStatus === 'ready' && (
            <details>
              <summary className="cursor-pointer text-sm text-text-secondary marker:text-text-muted">
                Transcript ready
              </summary>
              <p className="mt-1.5 max-h-40 overflow-y-auto whitespace-pre-wrap text-sm text-text-muted">
                {interview.transcript}
              </p>
            </details>
          )}
        </div>

        {/* Generated, and labelled as such. */}
        {interview.aiSummary && (
          <div className="rounded-md bg-info-subtle px-2.5 py-2">
            <span className="flex items-center gap-1.5 text-2xs font-medium uppercase tracking-wider text-info-text">
              <Sparkles className="size-3" aria-hidden="true" />
              AI summary — a draft, not a decision
            </span>
            <p className="mt-1 text-base text-text-secondary">{interview.aiSummary}</p>
          </div>
        )}

        {/* The verdict. Only ever written by a person. */}
        <TextAreaField
          label="Your notes"
          rows={3}
          value={feedback}
          onChange={(event) => setFeedback(event.target.value)}
          placeholder="What did you make of them? This is your assessment, not the summary's."
        />

        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium text-text">Recommendation</span>
          <div className="flex gap-0.5">
            {RECOMMENDATIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={recommendation === option.value}
                onClick={() => setRecommendation(option.value)}
                className={cn(
                  'h-7 flex-1 rounded-sm text-sm font-medium transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  recommendation === option.value
                    ? option.tone === 'positive'
                      ? 'bg-positive text-white'
                      : option.tone === 'critical'
                        ? 'bg-critical text-white'
                        : 'bg-surface-hover text-text'
                    : 'bg-surface-sunken text-text-secondary hover:bg-surface-hover hover:text-text',
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {error && <p className="text-sm text-critical-text">{error}</p>}

        <div className="flex justify-end">
          <Button
            variant="primary"
            size="md"
            disabled={pending || !feedback.trim()}
            onClick={save}
          >
            {pending ? 'Saving…' : 'Save notes'}
          </Button>
        </div>
      </div>
    </Panel>
  );
}
