import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ArtworkThumb } from './ArtworkThumb';

describe('ArtworkThumb', () => {
  it('renders the first-letter fallback while the image loads', () => {
    render(
      <ArtworkThumb src='https://x.invalid/a.jpg' title='Lost' size={40} />
    );
    expect(screen.getByText('L')).toBeInTheDocument();
  });

  it('uppercases the fallback letter from the trimmed title', () => {
    render(
      <ArtworkThumb src='https://x.invalid/a.jpg' title='  echo' size={40} />
    );
    expect(screen.getByText('E')).toBeInTheDocument();
  });

  it('uses a middle-dot when the title is empty', () => {
    render(<ArtworkThumb src='https://x.invalid/a.jpg' title='' size={40} />);
    expect(screen.getByText('·')).toBeInTheDocument();
  });

  it('applies the size as inline width and height', () => {
    const { container } = render(
      <ArtworkThumb src='https://x.invalid/a.jpg' title='X' size={88} />
    );
    const tile = container.firstElementChild as HTMLElement;
    expect(tile.style.width).toBe('88px');
    expect(tile.style.height).toBe('88px');
  });
});
