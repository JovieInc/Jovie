import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ArtworkPlayOverlay } from './ArtworkPlayOverlay';

describe('ArtworkPlayOverlay', () => {
  it('renders Play icon when not playing', () => {
    render(<ArtworkPlayOverlay isPlaying={false} onPlay={() => {}} visible />);
    expect(screen.getByLabelText('Play')).toBeInTheDocument();
  });

  it('renders Pause icon when playing', () => {
    render(<ArtworkPlayOverlay isPlaying={true} onPlay={() => {}} visible />);
    expect(screen.getByLabelText('Pause')).toBeInTheDocument();
  });

  it('is keyboard-focusable when visible, not when hidden', () => {
    const a = render(
      <ArtworkPlayOverlay isPlaying={false} onPlay={() => {}} visible />
    );
    expect(a.getByLabelText('Play').getAttribute('tabIndex')).toBe('0');
    a.unmount();

    const b = render(
      <ArtworkPlayOverlay isPlaying={false} onPlay={() => {}} visible={false} />
    );
    expect(b.getByLabelText('Play').getAttribute('tabIndex')).toBe('-1');
  });

  it('fires onPlay on click', () => {
    const onPlay = vi.fn();
    render(<ArtworkPlayOverlay isPlaying={false} onPlay={onPlay} visible />);
    fireEvent.click(screen.getByLabelText('Play'));
    expect(onPlay).toHaveBeenCalledOnce();
  });
});
