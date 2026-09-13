import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AudioPlayButton } from './AudioPlayControl';

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

  it('reuses the canonical primary Button for compact player controls', () => {
    render(<AudioPlayButton isPlaying={false} onClick={vi.fn()} />);

    const button = screen.getByRole('button', { name: 'Play' });
    expect(button).toHaveAttribute('data-variant', 'primary');
    expect(button).toHaveAttribute('data-size', 'icon');
    expect(button).toHaveClass('bg-btn-primary', 'text-btn-primary-foreground');
  });

  it('reuses the canonical Button hit target for the persistent compact control', () => {
    render(
      <AudioPlayButton isPlaying={false} onClick={vi.fn()} size='persistent' />
    );

    const button = screen.getByRole('button', { name: 'Play' });
    expect(button).toHaveAttribute('data-variant', 'ghost');
    expect(button).toHaveAttribute('data-size', 'icon-sm');
    expect(button).toHaveClass('before:h-11');
  });
});
