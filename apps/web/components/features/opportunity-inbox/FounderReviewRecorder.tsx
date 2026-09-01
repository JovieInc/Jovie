'use client';

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import {
  createWebSpeechTranscriber,
  type Transcriber,
  type TranscriberErrorCode,
} from '@/lib/chat/transcriber';
import {
  createFounderReviewClient,
  deleteFounderReviewAudio,
  listFounderReviewReceipts,
  updateFounderReviewActionOutcome,
  uploadFounderReviewAudio,
} from '@/lib/founder-review/client';
import {
  FOUNDER_REVIEW_DISCLOSURE_VERSION,
  type FounderReviewReceipt,
  type FounderReviewTarget,
} from '@/lib/founder-review/contract';
import { FounderReviewRecorderControls } from './FounderReviewRecorderControls';

type Decision = 'approved' | 'rejected' | 'deferred' | 'note';
type InitiatedBy = 'button' | 'keyboard' | 'typed';

interface ActiveSegment {
  readonly id: string;
  readonly startedAt: string;
  readonly startedMs: number;
  readonly initiatedBy: InitiatedBy;
  readonly recorder: MediaRecorder | null;
  readonly chunks: Blob[];
  readonly contentType: 'audio/webm' | 'audio/mp4' | 'audio/ogg' | null;
  readonly transcriber: Transcriber;
}

export interface FounderReviewRecorderProps {
  readonly target: FounderReviewTarget;
  readonly onApprove?: () => void | Promise<void>;
  readonly onReject?: () => void | Promise<void>;
  readonly className?: string;
}

export interface FounderReviewRecorderHandle {
  readonly approve: () => void;
  readonly reject: () => void;
}

function uuid(): string {
  if (globalThis.crypto.randomUUID) return globalThis.crypto.randomUUID();
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, byte =>
    byte.toString(16).padStart(2, '0')
  ).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function preferredAudioType(): ActiveSegment['contentType'] {
  if (!globalThis.MediaRecorder) return null;
  const types = ['audio/webm', 'audio/mp4', 'audio/ogg'] as const;
  return types.find(type => MediaRecorder.isTypeSupported(type)) ?? null;
}

function stopRecorder(segment: ActiveSegment): Promise<Blob | null> {
  const recorder = segment.recorder;
  if (!recorder || !segment.contentType) return Promise.resolve(null);
  if (recorder.state === 'inactive') {
    return Promise.resolve(
      segment.chunks.length > 0
        ? new Blob(segment.chunks, { type: segment.contentType })
        : null
    );
  }
  return new Promise(resolve => {
    recorder.addEventListener(
      'stop',
      () => {
        resolve(
          segment.chunks.length > 0
            ? new Blob(segment.chunks, { type: segment.contentType ?? '' })
            : null
        );
      },
      { once: true }
    );
    recorder.stop();
  });
}

function permissionMessage(code: TranscriberErrorCode | 'permission-denied') {
  if (
    code === 'not-allowed' ||
    code === 'service-not-allowed' ||
    code === 'permission-denied'
  ) {
    return 'Microphone access is off. Your typed note is still available.';
  }
  if (code === 'audio-capture') {
    return 'No microphone was found. Your typed note is still available.';
  }
  return 'Live transcription stopped. Your typed note is still available.';
}

export const FounderReviewRecorder = forwardRef<
  FounderReviewRecorderHandle,
  FounderReviewRecorderProps
>(function FounderReviewRecorder(
  { target, onApprove, onReject, className },
  ref
) {
  const sessionIdRef = useRef(uuid());
  const streamRef = useRef<MediaStream | null>(null);
  const activeSegmentRef = useRef<ActiveSegment | null>(null);
  const sessionActiveRef = useRef(false);
  const acquiringStreamRef = useRef(false);
  const disposedRef = useRef(false);
  const transcriptRef = useRef('');
  const typedTextRef = useRef('');
  const transcriberErrorRef = useRef<TranscriberErrorCode | null>(null);
  const pendingReviewRef = useRef<
    Parameters<typeof createFounderReviewClient>[0] | null
  >(null);
  const savingRef = useRef(false);
  const retryOutcomeReceiptRef = useRef<FounderReviewReceipt | null>(null);
  const appliedOutcomeReceiptRef = useRef<FounderReviewReceipt | null>(null);
  const targetRef = useRef(target);
  const [sessionActive, setSessionActive] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [typedText, setTypedText] = useState('');
  const [keepAudio, setKeepAudio] = useState(false);
  const [allowContentUse, setAllowContentUse] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [latestReceipt, setLatestReceipt] =
    useState<FounderReviewReceipt | null>(null);

  useEffect(() => {
    targetRef.current = target;
  }, [target]);

  const resetDraft = useCallback(() => {
    transcriptRef.current = '';
    typedTextRef.current = '';
    transcriberErrorRef.current = null;
    setTranscript('');
    setTypedText('');
    setKeepAudio(false);
    setAllowContentUse(false);
    setError(null);
  }, []);

  const startSegment = useCallback(
    (stream: MediaStream, initiatedBy: InitiatedBy = 'button') => {
      if (activeSegmentRef.current) return;
      resetDraft();
      const id = uuid();
      const contentType = preferredAudioType();
      const chunks: Blob[] = [];
      let recorder: MediaRecorder | null = null;
      if (contentType) {
        try {
          recorder = new MediaRecorder(stream, { mimeType: contentType });
          recorder.addEventListener('dataavailable', event => {
            if (event.data.size > 0) chunks.push(event.data);
          });
          recorder.start();
        } catch {
          recorder = null;
        }
      }
      let committedTranscript = '';
      let recognitionTranscript = '';
      let transcriber: Transcriber;
      transcriber = createWebSpeechTranscriber({
        onTranscript: text => {
          if (activeSegmentRef.current?.id !== id) return;
          recognitionTranscript = text;
          const cumulativeTranscript = [
            committedTranscript,
            recognitionTranscript,
          ]
            .filter(Boolean)
            .join(' ')
            .trim();
          transcriptRef.current = cumulativeTranscript;
          setTranscript(cumulativeTranscript);
        },
        onError: code => {
          if (activeSegmentRef.current?.id === id) {
            transcriberErrorRef.current = code;
            setError(permissionMessage(code));
          }
        },
        onEnd: () => {
          if (sessionActiveRef.current && activeSegmentRef.current?.id === id) {
            committedTranscript = [committedTranscript, recognitionTranscript]
              .filter(Boolean)
              .join(' ')
              .trim();
            recognitionTranscript = '';
            transcriber.start();
          }
        },
      });
      activeSegmentRef.current = {
        id,
        startedAt: new Date().toISOString(),
        startedMs: Date.now(),
        initiatedBy,
        recorder,
        chunks,
        contentType,
        transcriber,
      };
      transcriber.start();
      if (!transcriber.isSupported) {
        setError(
          'Live transcription is unavailable in this window. Recording and typed notes still work.'
        );
      } else if (!recorder) {
        setError(
          'Audio retention is unavailable in this window. Live transcription and typed notes still work.'
        );
      }
      return initiatedBy;
    },
    [resetDraft]
  );

  const startSession = useCallback(
    async (initiatedBy: InitiatedBy = 'button') => {
      if (
        sessionActiveRef.current ||
        acquiringStreamRef.current ||
        savingRef.current
      )
        return;
      if (pendingReviewRef.current || retryOutcomeReceiptRef.current) {
        setError('Retry the pending receipt before starting a new session.');
        return;
      }
      acquiringStreamRef.current = true;
      setError(null);
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: false,
        });
        if (disposedRef.current || sessionActiveRef.current) {
          stream.getTracks().forEach(track => track.stop());
          return;
        }
        streamRef.current = stream;
        sessionActiveRef.current = true;
        setSessionActive(true);
        startSegment(stream, initiatedBy);
      } catch {
        setError(permissionMessage('permission-denied'));
      } finally {
        acquiringStreamRef.current = false;
      }
    },
    [startSegment]
  );

  const stopStream = useCallback(() => {
    sessionActiveRef.current = false;
    setSessionActive(false);
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
  }, []);

  const persistDecision = useCallback(
    async (decision: Decision, stopAfter = false) => {
      if (savingRef.current) return;
      savingRef.current = true;
      setSaving(true);
      setError(null);
      const segment = activeSegmentRef.current;
      try {
        const appliedOutcomeReceipt = appliedOutcomeReceiptRef.current;
        if (appliedOutcomeReceipt) {
          const reconciled = await updateFounderReviewActionOutcome({
            receiptId: appliedOutcomeReceipt.id,
            status: 'applied',
            errorCode: null,
          });
          if (reconciled.actionOutcome.status !== 'applied') {
            throw new Error('Prior receipt outcome remained pending');
          }
          appliedOutcomeReceiptRef.current = null;
          pendingReviewRef.current = null;
          retryOutcomeReceiptRef.current = null;
          setLatestReceipt(reconciled);
          setError('Prior action receipt reconciled. Choose this card again.');
          return;
        }
        let review = pendingReviewRef.current;
        let receipt = retryOutcomeReceiptRef.current;
        if (
          receipt &&
          (receipt.decision !== decision ||
            receipt.target.type !== targetRef.current.type ||
            receipt.target.id !== targetRef.current.id)
        ) {
          throw new Error(
            `Reconcile the pending receipt for ${receipt.target.title} before reviewing this card.`
          );
        }
        if (
          review &&
          (review.decision !== decision ||
            review.target.type !== targetRef.current.type ||
            review.target.id !== targetRef.current.id)
        ) {
          throw new Error(
            `Retry the pending ${review.decision} receipt for ${review.target.title} before choosing another decision.`
          );
        }
        if (!review && !receipt) {
          const endedAt = new Date();
          const durationMs = segment
            ? Math.max(0, Date.now() - segment.startedMs)
            : null;
          activeSegmentRef.current = null;
          segment?.transcriber.stop();
          const blob = segment ? await stopRecorder(segment) : null;
          segment?.transcriber.dispose();
          const media =
            keepAudio && blob && segment?.contentType && durationMs !== null
              ? await uploadFounderReviewAudio({
                  sessionId: sessionIdRef.current,
                  segmentId: segment.id,
                  blob,
                  contentType: segment.contentType,
                  durationMs,
                  target: targetRef.current,
                })
              : null;
          const hasTranscript = Boolean(transcriptRef.current.trim());
          const hasTyped = Boolean(typedTextRef.current.trim());
          review = {
            sessionId: sessionIdRef.current,
            segmentId: segment?.id ?? uuid(),
            target: targetRef.current,
            decision,
            transcript: transcriptRef.current,
            typedText: typedTextRef.current,
            transcription: {
              provider: hasTranscript
                ? hasTyped
                  ? 'mixed'
                  : 'web-speech'
                : hasTyped
                  ? 'typed'
                  : 'none',
              status: hasTranscript
                ? 'complete'
                : hasTyped
                  ? 'typed-only'
                  : transcriberErrorRef.current === 'not-allowed' ||
                      transcriberErrorRef.current === 'service-not-allowed'
                    ? 'permission-denied'
                    : segment?.transcriber.isSupported
                      ? 'failed'
                      : 'unsupported',
              errorCode: transcriberErrorRef.current,
            },
            recording: {
              startedAt: segment?.startedAt ?? null,
              endedAt: endedAt.toISOString(),
              initiatedBy: segment?.initiatedBy ?? 'typed',
              status: media
                ? 'captured-retained'
                : blob
                  ? 'captured-discarded'
                  : segment
                    ? 'failed'
                    : 'not-captured',
              retention: media ? 'audio-and-transcript' : 'transcript-only',
              durationMs,
              media,
            },
            consent: {
              disclosureVersion: FOUNDER_REVIEW_DISCLOSURE_VERSION,
              contentUse: allowContentUse ? 'allowed' : 'not-allowed',
              capturedAt: endedAt.toISOString(),
            },
          };
          pendingReviewRef.current = review;
        }
        if (!receipt) {
          if (!review) throw new Error('Founder review draft missing');
          receipt = await createFounderReviewClient(review);
          if (receipt.decision !== decision) {
            throw new Error('Saved receipt does not match this decision');
          }
        }
        setLatestReceipt(receipt);
        const action =
          decision === 'approved'
            ? onApprove
            : decision === 'rejected'
              ? onReject
              : undefined;
        if (
          receipt.actionOutcome.status !== 'applied' &&
          receipt.actionOutcome.status !== 'not-applicable'
        ) {
          if (!action) {
            const failedReceipt = await updateFounderReviewActionOutcome({
              receiptId: receipt.id,
              status: 'failed',
              errorCode: 'canonical-action-handler-missing',
            });
            retryOutcomeReceiptRef.current = failedReceipt;
            setLatestReceipt(failedReceipt);
            throw new Error('The canonical action handler is unavailable.');
          }
          let actionSucceeded = false;
          try {
            await action();
            actionSucceeded = true;
          } catch (caught) {
            const failedReceipt = await updateFounderReviewActionOutcome({
              receiptId: receipt.id,
              status: 'failed',
              errorCode: 'canonical-action-failed',
            });
            setLatestReceipt(failedReceipt);
            if (failedReceipt.actionOutcome.status !== 'applied') {
              retryOutcomeReceiptRef.current = failedReceipt;
              throw caught;
            }
            receipt = failedReceipt;
          }
          if (actionSucceeded) {
            try {
              receipt = await updateFounderReviewActionOutcome({
                receiptId: receipt.id,
                status: 'applied',
                errorCode: null,
              });
              if (receipt.actionOutcome.status !== 'applied') {
                throw new Error('Receipt outcome remained pending');
              }
            } catch {
              appliedOutcomeReceiptRef.current = receipt;
              pendingReviewRef.current = null;
              retryOutcomeReceiptRef.current = receipt;
              throw new Error(
                'The action applied, but its receipt outcome still needs reconciliation.'
              );
            }
          }
        }
        pendingReviewRef.current = null;
        retryOutcomeReceiptRef.current = null;
        setLatestReceipt(receipt);
        resetDraft();
        if (stopAfter) {
          stopStream();
        } else if (sessionActiveRef.current && streamRef.current) {
          startSegment(streamRef.current);
        }
      } catch (caught) {
        setError(
          caught instanceof Error
            ? `Not saved. ${caught.message}`
            : 'Not saved. Try again before making a decision.'
        );
        stopStream();
      } finally {
        savingRef.current = false;
        setSaving(false);
      }
    },
    [
      allowContentUse,
      keepAudio,
      onApprove,
      onReject,
      resetDraft,
      startSegment,
      stopStream,
    ]
  );

  const stopSession = useCallback(() => {
    void persistDecision(
      target.type === 'founder-note' ? 'note' : 'deferred',
      true
    );
  }, [persistDecision, target.type]);

  useImperativeHandle(
    ref,
    () => ({
      approve: () => void persistDecision('approved'),
      reject: () => void persistDecision('rejected'),
    }),
    [persistDecision]
  );

  useEffect(() => {
    const stream = streamRef.current;
    if (
      sessionActiveRef.current &&
      stream &&
      !activeSegmentRef.current &&
      !pendingReviewRef.current
    ) {
      startSegment(stream);
    }
  }, [startSegment, target]);

  useEffect(() => {
    void listFounderReviewReceipts()
      .then(receipts => {
        const latest = receipts[0] ?? null;
        setLatestReceipt(latest);
        retryOutcomeReceiptRef.current =
          receipts.find(
            receipt =>
              receipt.target.type === targetRef.current.type &&
              receipt.target.id === targetRef.current.id &&
              (receipt.actionOutcome.status === 'pending' ||
                receipt.actionOutcome.status === 'failed')
          ) ?? null;
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (
        !(event.metaKey || event.ctrlKey) ||
        !event.shiftKey ||
        event.key.toLowerCase() !== 'm'
      ) {
        return;
      }
      event.preventDefault();
      if (sessionActiveRef.current) stopSession();
      else void startSession('keyboard');
    };
    globalThis.addEventListener('keydown', handleShortcut);
    return () => globalThis.removeEventListener('keydown', handleShortcut);
  }, [startSession, stopSession]);

  useEffect(
    () => () => {
      disposedRef.current = true;
      activeSegmentRef.current?.transcriber.dispose();
      if (activeSegmentRef.current?.recorder?.state === 'recording') {
        activeSegmentRef.current.recorder.stop();
      }
      streamRef.current?.getTracks().forEach(track => track.stop());
    },
    []
  );

  const deleteLatestAudio = async () => {
    if (!latestReceipt?.recording.mediaAvailable || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      setLatestReceipt(await deleteFounderReviewAudio(latestReceipt.id));
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Audio deletion failed'
      );
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <FounderReviewRecorderControls
      target={target}
      sessionActive={sessionActive}
      transcript={transcript}
      typedText={typedText}
      keepAudio={keepAudio}
      allowContentUse={allowContentUse}
      saving={saving}
      error={error}
      latestReceipt={latestReceipt}
      className={className}
      onStart={() => void startSession()}
      onStop={stopSession}
      onTypedTextChange={value => {
        typedTextRef.current = value;
        setTypedText(value);
      }}
      onKeepAudioChange={setKeepAudio}
      onAllowContentUseChange={setAllowContentUse}
      onDeleteAudio={() => void deleteLatestAudio()}
      onSaveNote={() => void persistDecision('note', true)}
      onApprove={() => void persistDecision('approved')}
      onReject={() => void persistDecision('rejected')}
    />
  );
});
