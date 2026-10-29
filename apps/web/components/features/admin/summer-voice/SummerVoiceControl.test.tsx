import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SummerVoiceControlView } from './SummerVoiceControl';
import type { SummerVoiceState } from './useSummerVoice';

const base: SummerVoiceState = {
  status: 'idle',
  errorCode: null,
  transcript: '',
  reply: '',
  lastTurnMs: null,
};

describe('SummerVoiceControlView', () => {
  it('starts a conversation from idle', () => {
    const start = vi.fn();
    render(
      <SummerVoiceControlView state={base} start={start} stop={vi.fn()} />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Talk to Summer' }));
    expect(start).toHaveBeenCalledOnce();
  });

  it('ends the conversation while live and shows the last turn latency', () => {
    const stop = vi.fn();
    render(
      <SummerVoiceControlView
        state={{ ...base, status: 'speaking', lastTurnMs: 820 }}
        start={vi.fn()}
        stop={stop}
      />
    );
    expect(screen.getByText(/Summer is speaking · 0.8s/)).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'End voice conversation' })
    );
    expect(stop).toHaveBeenCalledOnce();
  });

  it('explains an unconfigured voice setup instead of failing silently', () => {
    render(
      <SummerVoiceControlView
        state={{ ...base, status: 'error', errorCode: 'voice_not_configured' }}
        start={vi.fn()}
        stop={vi.fn()}
      />
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Voice is not set up yet.'
    );
  });
});
