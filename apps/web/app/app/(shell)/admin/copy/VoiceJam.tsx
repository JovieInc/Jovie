'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';

interface JamResponse {
  readonly transcript: string;
  readonly applied: ReadonlyArray<{
    readonly copyId: string;
    readonly verdict: string;
    readonly note: string;
  }>;
  readonly unmatched: ReadonlyArray<{
    segment: string;
    copyIds: readonly string[];
  }>;
}

type State =
  | { kind: 'idle' }
  | { kind: 'recording' }
  | { kind: 'sending' }
  | { kind: 'done'; result: JamResponse }
  | { kind: 'error'; message: string };

/** Record a memo ("HOME-3 sucks, too long. HOME-4 great.") and apply it. */
export function VoiceJam() {
  const router = useRouter();
  const [state, setState] = useState<State>({ kind: 'idle' });
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);

  async function start() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunks.current = [];
      rec.ondataavailable = e => chunks.current.push(e.data);
      rec.onstop = () => {
        for (const track of stream.getTracks()) track.stop();
        void send(
          new Blob(chunks.current, { type: rec.mimeType || 'audio/webm' })
        );
      };
      recorder.current = rec;
      rec.start();
      setState({ kind: 'recording' });
    } catch {
      setState({
        kind: 'error',
        message: 'Microphone is blocked. Allow it and try again.',
      });
    }
  }

  async function send(blob: Blob) {
    setState({ kind: 'sending' });
    try {
      const res = await fetch('/api/admin/copy-jam/jam', {
        method: 'POST',
        headers: { 'content-type': blob.type.split(';')[0] || 'audio/webm' },
        body: blob,
      });
      if (res.status === 503) {
        setState({
          kind: 'error',
          message: 'Voice is not set up here yet. Tap the verdicts instead.',
        });
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
      setState({ kind: 'done', result: (await res.json()) as JamResponse });
      router.refresh();
    } catch {
      setState({
        kind: 'error',
        message: 'The memo did not go through. Record it again.',
      });
    }
  }

  const busy = state.kind === 'sending';
  return (
    <section aria-label='Voice Jam' className='flex flex-col gap-3'>
      <div className='flex items-center gap-3'>
        <button
          type='button'
          disabled={busy}
          onClick={() => {
            if (state.kind === 'recording') recorder.current?.stop();
            else void start();
          }}
          className='h-9 rounded-md border border-default bg-surface-1 px-4 text-sm text-primary-token'
        >
          {state.kind === 'recording'
            ? 'Stop'
            : busy
              ? 'Sending'
              : 'Record a jam'}
        </button>
        <span className='text-sm text-tertiary-token'>
          Say the ID and a verdict: &ldquo;Home three sucks, too long. Smart
          links two, great.&rdquo;
        </span>
      </div>
      {state.kind === 'error' ? (
        <p role='alert' className='text-sm text-secondary-token'>
          {state.message}
        </p>
      ) : null}
      {state.kind === 'done' ? (
        <div
          className='flex flex-col gap-1 text-sm'
          data-testid='voice-jam-result'
        >
          <p className='text-secondary-token'>
            Heard: {state.result.transcript}
          </p>
          {state.result.applied.map(a => (
            <p key={`${a.copyId}-${a.verdict}`} className='text-primary-token'>
              {a.copyId} {a.verdict}
              {a.note ? ` · ${a.note}` : ''}
            </p>
          ))}
          {state.result.unmatched.map(u => (
            <p key={u.copyIds.join()} className='text-secondary-token'>
              Not sure: {u.copyIds.join(', ')} &ldquo;{u.segment}&rdquo;. Tap it
              below.
            </p>
          ))}
          {state.result.applied.length === 0 &&
          state.result.unmatched.length === 0 ? (
            <p className='text-secondary-token'>
              No IDs heard. Say the ID first, then the verdict.
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
