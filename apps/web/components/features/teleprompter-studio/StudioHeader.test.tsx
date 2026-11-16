import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { StudioHeader } from './StudioHeader';

const base = {
  title: 'Release day shout-out',
  isRecording: false,
  takeNumber: 1,
  elapsedMs: 0,
  savedCount: 0,
  follow: { voice: true, label: 'Follows Your Voice' },
  onClose: vi.fn(),
};

describe('StudioHeader', () => {
  it('shows the title before any take', () => {
    render(<StudioHeader {...base} />);

    expect(screen.getByText('Release day shout-out')).toBeInTheDocument();
    expect(screen.getByText('Follows Your Voice')).toBeInTheDocument();
  });

  it('shows the take timer and locks close while recording', () => {
    render(
      <StudioHeader {...base} isRecording takeNumber={3} elapsedMs={65_000} />
    );

    expect(screen.getByText(/Take 3/)).toBeInTheDocument();
    expect(screen.getByTestId('teleprompter-studio-close')).toBeDisabled();
  });

  it('counts saved takes and closes on request', () => {
    const onClose = vi.fn();
    render(
      <StudioHeader {...base} savedCount={2} follow={null} onClose={onClose} />
    );

    expect(screen.getByText('2 Takes Saved')).toBeInTheDocument();
    expect(screen.queryByText('Follows Your Voice')).toBeNull();
    fireEvent.click(screen.getByTestId('teleprompter-studio-close'));
    expect(onClose).toHaveBeenCalled();
  });
});
