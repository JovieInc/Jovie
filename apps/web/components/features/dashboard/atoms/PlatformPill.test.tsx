import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PlatformPill } from './PlatformPill';

describe('PlatformPill accessible naming (label-content-name-mismatch)', () => {
  it('names an expanded interactive pill from its visible text', () => {
    render(
      <PlatformPill
        platformIcon='spotify'
        platformName='Spotify'
        primaryText='my-artist'
        onClick={vi.fn()}
      />
    );

    const button = screen.getByRole('button');
    expect(button).toHaveAccessibleName('Select Spotify: my-artist');
    expect(button).toHaveTextContent('my-artist');
  });

  it('keeps the collapsed pill label containing the visible text', () => {
    render(
      <PlatformPill
        platformIcon='spotify'
        platformName='Spotify'
        primaryText='my-artist'
        collapsed
        onClick={vi.fn()}
      />
    );

    expect(screen.getByRole('button')).toHaveAccessibleName(
      'Spotify: my-artist'
    );
  });
});
