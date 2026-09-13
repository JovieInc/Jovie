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

  it('uses canonical primary tokens for compact player controls', () => {
    render(<AudioPlayButton isPlaying={false} onClick={vi.fn()} />);

    const button = screen.getByRole('button', { name: 'Play' });
    expect(button).toHaveClass('border-btn-primary', 'transition-colors');
    expect(button.className).not.toMatch(/--linear-/);
    expect(button.className).not.toMatch(/content-\[/);
    expect(button.className).not.toMatch(/transition-\[/);
  });

  it('uses canonical tokens for the persistent compact control', () => {
    render(
      <AudioPlayButton isPlaying={false} onClick={vi.fn()} size='persistent' />
    );

    const button = screen.getByRole('button', { name: 'Play' });
    expect(button).toHaveClass(
      'transition-colors',
      'before:h-11',
      'before:min-w-11'
    );
    expect(button.className).not.toMatch(/content-\[/);
    expect(button.className).not.toMatch(/transition-\[/);
    expect(button.className).not.toMatch(/--linear-/);
  });
});
