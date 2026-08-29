'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from '@/components/feedback';
import { OpportunityRow } from '@/components/organisms/opportunity-card/OpportunityRow';
import {
  canRecordScreen,
  type ScreenRecordingSession,
  startScreenRecording,
} from '@/lib/capture/record-screen';
import type { OpportunityInboxCardViewModel } from '@/lib/connectors/opportunity-inbox-types';
import {
  mutateWorkflowCaptureClient,
  uploadWorkflowCapture,
  workflowCaptureMediaPath,
} from '@/lib/workflow-capture/client';

type CapturePhase =
  | 'idle'
  | 'recording'
  | 'uploading'
  | 'review'
  | 'sending'
  | 'deleting';

export interface WorkflowCaptureInboxCardProps {
  readonly card: OpportunityInboxCardViewModel;
  readonly onDismiss: (id: string) => void;
  readonly onComplete: (id: string) => void;
}

function phaseLabel(phase: CapturePhase): string {
  if (phase === 'recording') return 'Stop Recording';
  if (phase === 'uploading') return 'Uploading…';
  if (phase === 'review') return 'Send Recording';
  if (phase === 'sending') return 'Sending…';
  if (phase === 'deleting') return 'Deleting…';
  return 'Record';
}

export function WorkflowCaptureInboxCard({
  card,
  onDismiss,
  onComplete,
}: WorkflowCaptureInboxCardProps) {
  const initialPhase =
    card.workflowCapture?.state === 'uploaded_needs_review' ? 'review' : 'idle';
  const [phase, setPhase] = useState<CapturePhase>(initialPhase);
  const sessionRef = useRef<ScreenRecordingSession | null>(null);
  const isBusy =
    phase === 'uploading' || phase === 'sending' || phase === 'deleting';

  useEffect(
    () => () => {
      const activeSession = sessionRef.current;
      sessionRef.current = null;
      if (activeSession) void activeSession.stop().catch(() => undefined);
    },
    []
  );

  const stopAndUpload = useCallback(async () => {
    const session = sessionRef.current;
    if (!session) return;
    setPhase('uploading');
    try {
      const recording = await session.stop();
      await uploadWorkflowCapture(card.id, recording);
      setPhase('review');
      toast.success('Recording stored privately. Review it before sending.');
    } catch (error) {
      setPhase('idle');
      toast.error(
        error instanceof Error ? error.message : 'Could not store the recording'
      );
    } finally {
      sessionRef.current = null;
    }
  }, [card.id]);

  const startRecording = useCallback(async () => {
    if (!canRecordScreen()) {
      toast.error('Screen recording is not available in this window.');
      return;
    }
    try {
      sessionRef.current = await startScreenRecording('workflow_capture');
      setPhase('recording');
    } catch {
      toast.error('Screen recording was blocked or cancelled.');
    }
  }, []);

  const handlePrimaryAction = useCallback(() => {
    if (phase === 'recording') {
      void stopAndUpload();
      return;
    }
    if (phase === 'review') {
      setPhase('sending');
      void mutateWorkflowCaptureClient(card.id, { action: 'mark-ready' })
        .then(() => {
          toast.success('Recording sent back to the requesting task.');
          onComplete(card.id);
        })
        .catch(error => {
          setPhase('review');
          toast.error(
            error instanceof Error ? error.message : 'Could not send recording'
          );
        });
      return;
    }
    if (phase === 'idle') void startRecording();
  }, [card.id, onComplete, phase, startRecording, stopAndUpload]);

  const revoke = useCallback(() => {
    setPhase('deleting');
    void mutateWorkflowCaptureClient(card.id, { action: 'revoke' })
      .then(() => {
        toast.success('Recording deleted and access revoked.');
        onComplete(card.id);
      })
      .catch(error => {
        setPhase('review');
        toast.error(
          error instanceof Error ? error.message : 'Could not delete recording'
        );
      });
  }, [card.id, onComplete]);

  const status =
    phase === 'recording'
      ? 'Recording. Stop before any password, 2FA code, or key appears.'
      : phase === 'review'
        ? 'Review the private recording before sending it.'
        : 'Never record passwords, 2FA codes, or keys.';

  return (
    <section data-testid={`workflow-capture-card-${card.id}`}>
      <ul className='m-0 list-none p-0'>
        <OpportunityRow
          id={card.id}
          state={phase === 'review' ? 'in-progress' : 'new'}
          title={card.title}
          metadata={card.why}
          primaryActionLabel={phaseLabel(phase)}
          onPrimaryAction={handlePrimaryAction}
          onDismiss={phase === 'review' ? revoke : onDismiss}
          isBusy={isBusy}
          className='[&_button:first-of-type]:min-w-32'
        />
      </ul>
      <div className='min-h-8 px-5 pb-2 text-2xs text-tertiary-token'>
        <span>{status}</span>
        <span className='ml-3 inline-flex gap-3'>
          {card.workflowCapture?.startUrl && phase === 'idle' ? (
            <a
              href={card.workflowCapture.startUrl}
              target='_blank'
              rel='noreferrer'
              className='text-secondary-token underline'
            >
              Open Workflow
            </a>
          ) : null}
          {phase === 'review' ? (
            <a
              href={workflowCaptureMediaPath(card.id)}
              target='_blank'
              rel='noreferrer'
              className='text-secondary-token underline'
            >
              Review Recording
            </a>
          ) : null}
        </span>
      </div>
    </section>
  );
}
