import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AudioPlayButton } from './AudioPlayButton';

describe('AudioPlayButton', () => {
  it('uses the playback state for its accessible action', () => {
    const onClick = vi.fn();
    const { rerender } = render(
      <AudioPlayButton isPlaying={false} onClick={onClick} />
    );

    expect(screen.getByRole('button', { name: 'Play' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    expect(onClick).toHaveBeenCalledOnce();

    rerender(<AudioPlayButton isPlaying onClick={onClick} />);
    expect(screen.getByRole('button', { name: 'Pause' })).toBeEnabled();
  });

  it('blocks playback while the source is loading', () => {
    const onClick = vi.fn();
    render(<AudioPlayButton isPlaying={false} isLoading onClick={onClick} />);

    const button = screen.getByRole('button', { name: 'Loading track' });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });
});
