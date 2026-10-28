import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { VoiceDemoVisual } from './VoiceDemoVisual';

const PLAY_LABEL = 'Play 4s sample (your voice)';
const PLAYING_LABEL = 'Playing sample…';

describe('VoiceDemoVisual', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('names the demo button with its visible label in the idle state', () => {
    render(<VoiceDemoVisual />);

    const button = screen.getByRole('button', { name: PLAY_LABEL });
    expect(button).not.toHaveAttribute('aria-label');
    expect(
      screen.getByText('Trained on your cadence, tone, and delivery.')
    ).toBeInTheDocument();
    expect(screen.queryByTestId('voice-demo-transcript')).toBeNull();
  });

  it('keeps the accessible name equal to the visible label through play, stop, and auto-completion', () => {
    vi.useFakeTimers();
    render(<VoiceDemoVisual />);
    const button = screen.getByTestId('voice-demo-play-btn');

    fireEvent.click(button);
    expect(button).toHaveAccessibleName(PLAYING_LABEL);
    expect(screen.getByTestId('voice-demo-transcript')).toBeInTheDocument();

    fireEvent.click(button);
    expect(button).toHaveAccessibleName(PLAY_LABEL);
    expect(
      screen.getByText(
        'Thanks — that was cloned from a 90s YouTube interview clip.'
      )
    ).toBeInTheDocument();

    fireEvent.click(button);
    expect(button).toHaveAccessibleName(PLAYING_LABEL);
    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(button).toHaveAccessibleName(PLAY_LABEL);
  });

  it('merges a caller className onto the demo container', () => {
    render(<VoiceDemoVisual className='custom-demo' />);

    expect(screen.getByTestId('voice-demo-visual')).toHaveClass('custom-demo');
  });
});
