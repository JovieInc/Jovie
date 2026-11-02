import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CopyableUrlRow } from './CopyableUrlRow';

describe('CopyableUrlRow', () => {
  it('offers Copy and Open by default', () => {
    render(<CopyableUrlRow url='https://jov.ie/tim/song' />);
    expect(screen.getByRole('button', { name: 'Copy link' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Open link' })).toBeVisible();
  });

  it('can drop Open when the surface already links to the page', () => {
    render(<CopyableUrlRow url='https://jov.ie/tim/song' showOpen={false} />);
    expect(screen.getByRole('button', { name: 'Copy link' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Open link' })).toBeNull();
  });
});
