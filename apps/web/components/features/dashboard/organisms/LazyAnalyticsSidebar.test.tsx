import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

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
  it('loads the live rail on demand', async () => {
    render(<AnalyticsSidebar isOpen onClose={vi.fn()} />);
    expect(await screen.findByTestId('live-rail')).toBeInTheDocument();
  });

  it('loads the static demo rail on demand with its props', async () => {
    render(
      <StaticAnalyticsSidebar
        isOpen
        onClose={vi.fn()}
        data={{ profile_views: 1 }}
        testId='demo-rail'
      />
    );
    expect(await screen.findByTestId('demo-rail')).toBeInTheDocument();
  });
});
