import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ThreadAudioCard } from './ThreadAudioCard';

describe('ThreadAudioCard', () => {
  it('renders the title, artist, and duration', () => {
    render(
      <ThreadAudioCard
        title='Lost in the Light'
        artist='Bahamas'
        duration='3:33'
      />
    );
    expect(screen.getByText('Lost in the Light')).toBeInTheDocument();
    expect(screen.getByText('Bahamas · 3:33')).toBeInTheDocument();
  });

  it('uses the banned-icon-safe AudioLines glyph for the artwork slot', () => {
    const { container } = render(
      <ThreadAudioCard title='t' artist='a' duration='0:42' />
    );
    const icon = container.querySelector('.system-b-thread-audio-artwork svg');
    expect(icon).toHaveClass('lucide-audio-lines');
    expect(icon).not.toHaveClass('lucide-disc-3');
  });

  it('disables the play button when no onPlay is provided', () => {
    render(<ThreadAudioCard title='t' artist='a' duration='0:42' />);
    expect(screen.getByRole('button', { name: /Play/ })).toBeDisabled();
  });

  it('fires onPlay when the play button is clicked', () => {
    const onPlay = vi.fn();
    render(
      <ThreadAudioCard title='t' artist='a' duration='0:42' onPlay={onPlay} />
    );
    fireEvent.click(screen.getByRole('button', { name: /Play/ }));
    expect(onPlay).toHaveBeenCalledOnce();
  });
});
