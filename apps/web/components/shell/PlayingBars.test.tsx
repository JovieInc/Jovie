import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PlayingBars } from './PlayingBars';

describe('PlayingBars', () => {
  it('exposes a default Now playing accessibility label', () => {
    render(<PlayingBars />);
    expect(
      screen.getByRole('img', { name: 'Now playing' })
    ).toBeInTheDocument();
  });

  it('honors an aria-label override', () => {
    render(<PlayingBars label='Track playing' />);
    expect(
      screen.getByRole('img', { name: 'Track playing' })
    ).toBeInTheDocument();
  });
});
