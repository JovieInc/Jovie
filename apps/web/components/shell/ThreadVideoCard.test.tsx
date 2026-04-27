import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ThreadVideoCard } from './ThreadVideoCard';

describe('ThreadVideoCard', () => {
  it('renders a duration formatted as m:ss', () => {
    render(<ThreadVideoCard title='clip' durationSec={94} />);
    expect(screen.getByText('1:34')).toBeInTheDocument();
  });

  it('renders 0:00 for a non-finite duration', () => {
    render(<ThreadVideoCard title='clip' durationSec={Number.NaN} />);
    expect(screen.getByText('0:00')).toBeInTheDocument();
  });

  it('renders the thumbnail as a non-button when onPlay is omitted', () => {
    render(<ThreadVideoCard title='clip' durationSec={20} />);
    expect(screen.queryByRole('button', { name: /Play/ })).toBeNull();
  });

  it('fires onPlay when the thumbnail is clicked', () => {
    const onPlay = vi.fn();
    render(<ThreadVideoCard title='clip' durationSec={20} onPlay={onPlay} />);
    fireEvent.click(screen.getByRole('button', { name: /Play clip/ }));
    expect(onPlay).toHaveBeenCalledOnce();
  });

  it('omits the full-screen toolbar button when onFullscreen is missing', () => {
    render(<ThreadVideoCard title='clip' durationSec={20} />);
    expect(screen.queryByRole('button', { name: 'Full-screen' })).toBeNull();
  });

  it('fires onFullscreen when the toolbar button is clicked', () => {
    const onFullscreen = vi.fn();
    render(
      <ThreadVideoCard
        title='clip'
        durationSec={20}
        onFullscreen={onFullscreen}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Full-screen' }));
    expect(onFullscreen).toHaveBeenCalledOnce();
  });
});
