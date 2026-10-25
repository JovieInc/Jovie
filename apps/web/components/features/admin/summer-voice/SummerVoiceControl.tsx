'use client';

import { Mic, Square } from 'lucide-react';
import { type SummerVoiceState, useSummerVoice } from './useSummerVoice';

const ERROR_COPY: Record<string, string> = {
  voice_not_configured: 'Voice is not set up yet.',
  voice_provider_unavailable: 'Voice is unavailable right now.',
  microphone_denied: 'Microphone access was denied.',
  founder_required: 'Voice is limited to the founder account.',
};

const STATUS_COPY = {
  idle: 'Talk to Summer',
  connecting: 'Connecting',
  listening: 'Listening',
  speaking: 'Summer is speaking',
  error: 'Talk to Summer',
} as const;

/**
 * Full-duplex voice entry for the Ovie composer. Speaking over Summer
 * interrupts her immediately. Shows the last turn latency so voice speed is
 * visible while it is being tuned.
 */
export function SummerVoiceControlView({
  state,
  start,
  stop,
}: Readonly<{
  state: SummerVoiceState;
  start: () => void;
  stop: () => void;
}>) {
  const active = state.status !== 'idle' && state.status !== 'error';

  return (
    <div
      className='mb-1.5 flex items-center justify-end gap-2 text-xs text-tertiary-token'
      data-testid='summer-voice-control'
      data-voice-status={state.status}
    >
      {state.status === 'error' ? (
        <span role='alert'>
          {ERROR_COPY[state.errorCode ?? ''] ?? 'Voice could not start.'}
        </span>
      ) : (
        <span aria-live='polite'>
          {STATUS_COPY[state.status]}
          {state.status !== 'idle' && state.lastTurnMs !== null
            ? ` · ${(state.lastTurnMs / 1000).toFixed(1)}s`
            : ''}
        </span>
      )}
      <button
        type='button'
        onClick={active ? stop : start}
        aria-pressed={active}
        aria-label={active ? 'End voice conversation' : 'Talk to Summer'}
        className='inline-flex h-7 w-7 items-center justify-center rounded-full border border-subtle bg-surface-1 text-secondary-token transition-colors hover:text-primary-token focus-visible:outline-2 focus-visible:outline-offset-2 data-[active=true]:text-primary-token'
        data-active={active}
      >
        {active ? (
          <Square className='h-3 w-3' aria-hidden='true' />
        ) : (
          <Mic className='h-3.5 w-3.5' aria-hidden='true' />
        )}
      </button>
    </div>
  );
}

export function SummerVoiceControl() {
  const { state, start, stop } = useSummerVoice();
  return (
    <SummerVoiceControlView
      state={state}
      start={() => void start()}
      stop={stop}
    />
  );
}
