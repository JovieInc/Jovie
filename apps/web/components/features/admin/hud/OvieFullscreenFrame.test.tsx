import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { fullscreenFeedStatus } from '@/lib/ovie/home/fullscreen-mode';
import { OvieFeedBanner } from './OvieFeedBanner';
import { OvieFullscreenFrame } from './OvieFullscreenFrame';

const status = (updatedAtMs: number | null) =>
  fullscreenFeedStatus(
    [{ id: 'revenue', updatedAtMs, pollMs: 30_000 }],
    Date.now()
  );

describe('OvieFeedBanner', () => {
  it('is absent while feeds are fresh', () => {
    render(<OvieFeedBanner status={status(Date.now())} />);
    expect(screen.queryByTestId('ovie-feed-banner')).toBeNull();
  });
  it('says Data stale with feed and age', () => {
    render(<OvieFeedBanner status={status(Date.now() - 2 * 60_000)} />);
    expect(screen.getByTestId('ovie-feed-banner')).toHaveTextContent(
      'Data stale: revenue 2m'
    );
  });
  it('a feed that never loaded reads Data down, never calm', () => {
    render(<OvieFeedBanner status={status(null)} />);
    expect(screen.getByTestId('ovie-feed-banner')).toHaveTextContent(
      'Data down: revenue never loaded'
    );
  });
});

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
