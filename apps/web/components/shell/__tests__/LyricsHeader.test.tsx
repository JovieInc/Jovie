import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LyricsHeader } from '../LyricsHeader';

describe('LyricsHeader', () => {
  it('renders artist › title as a breadcrumb', () => {
    render(
      <LyricsHeader track={{ artist: 'Bahamas', title: 'Lost in the Light' }} />
    );
    expect(screen.getByText('Bahamas')).toBeInTheDocument();
    expect(screen.getByText('Lost in the Light')).toBeInTheDocument();
  });

  it('renders artist as plain text when onArtistClick is omitted', () => {
    const { container } = render(
      <LyricsHeader track={{ artist: 'Bahamas', title: 'Lost in the Light' }} />
    );
    expect(container.querySelector('button')).toBeNull();
  });

  it('renders artist as a button when onArtistClick is provided', () => {
    const onArtistClick = vi.fn();
    render(
      <LyricsHeader
        track={{ artist: 'Bahamas', title: 'Lost in the Light' }}
        onArtistClick={onArtistClick}
      />
    );
    fireEvent.click(screen.getByText('Bahamas'));
    expect(onArtistClick).toHaveBeenCalledOnce();
  });
});
