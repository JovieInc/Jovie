import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { OvieWallFrame } from './OvieWallFrame';

function renderFrame(updatedAtMs: number | null) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <OvieWallFrame feeds={[{ id: 'revenue', updatedAtMs, pollMs: 30_000 }]}>
        <p>body</p>
      </OvieWallFrame>
    </QueryClientProvider>
  );
}

describe('OvieWallFrame', () => {
  it('shows no alert while feeds are fresh', () => {
    renderFrame(Date.now());
    expect(screen.getByTestId('ovie-wall')).toHaveAttribute(
      'data-feed-level',
      'live'
    );
    expect(screen.queryByTestId('ovie-wall-stale')).toBeNull();
    expect(screen.getByText('body')).toBeInTheDocument();
  });
  it('says DATA STALE with the feed and age when a feed stops', () => {
    renderFrame(Date.now() - 2 * 60_000);
    expect(screen.getByTestId('ovie-wall-stale')).toHaveTextContent(
      'DATA STALE: revenue 2m'
    );
  });
  it('a feed that never loaded reads DATA DOWN, never calm', () => {
    renderFrame(null);
    expect(screen.getByTestId('ovie-wall-stale')).toHaveTextContent(
      'DATA DOWN: revenue never loaded'
    );
  });
});
