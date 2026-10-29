import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { fullscreenFeedStatus } from '@/lib/ovie/home/fullscreen-mode';
import { OvieFullscreenFrame } from './OvieFullscreenFrame';

const status = (updatedAtMs: number | null) =>
  fullscreenFeedStatus(
    [{ id: 'revenue', updatedAtMs, pollMs: 30_000 }],
    Date.now()
  );

describe('OvieFullscreenFrame', () => {
  it('covers the shell with the same children', () => {
    render(
      <OvieFullscreenFrame status={status(Date.now())} now={Date.now()}>
        <p>home</p>
      </OvieFullscreenFrame>
    );
    expect(screen.getByTestId('ovie-fullscreen')).toHaveAttribute(
      'data-feed-level',
      'live'
    );
    expect(screen.getByText('home')).toBeInTheDocument();
  });
});
