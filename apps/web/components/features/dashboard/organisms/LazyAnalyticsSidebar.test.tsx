import { render, screen } from '@testing-library/react';
import { Suspense } from 'react';
import { describe, expect, it, vi } from 'vitest';

// The app bundle aliases next/dynamic to its App Router build, which suspends.
vi.mock('next/dynamic', async () => ({
  ...(await import('next/dist/shared/lib/app-dynamic')),
}));

vi.mock('./AnalyticsSidebar', () => ({
  AnalyticsSidebar: () => <div data-testid='live-rail' />,
  StaticAnalyticsSidebar: ({ testId }: { readonly testId?: string }) => (
    <div data-testid={testId ?? 'static-rail'} />
  ),
}));

import {
  AnalyticsSidebar,
  StaticAnalyticsSidebar,
} from './LazyAnalyticsSidebar';

describe('LazyAnalyticsSidebar', () => {
  // Runs first: React.lazy only suspends until the chunk resolves once.
  it('keeps the page on screen while the rail chunk loads', () => {
    render(
      <Suspense fallback={<div data-testid='shell-skeleton' />}>
        <div data-testid='page' />
        <AnalyticsSidebar isOpen onClose={vi.fn()} />
      </Suspense>
    );
    expect(screen.getByTestId('page')).toBeInTheDocument();
  });

  it('loads the live rail on demand', async () => {
    render(<AnalyticsSidebar isOpen onClose={vi.fn()} />);
    expect(await screen.findByTestId('live-rail')).toBeInTheDocument();
  });

  it('loads the static demo rail on demand with its props', async () => {
    render(
      <StaticAnalyticsSidebar
        isOpen
        onClose={vi.fn()}
        data={{
          profile_views: 1,
          top_cities: [],
          top_countries: [],
          top_referrers: [],
        }}
        testId='demo-rail'
      />
    );
    expect(await screen.findByTestId('demo-rail')).toBeInTheDocument();
  });
});
