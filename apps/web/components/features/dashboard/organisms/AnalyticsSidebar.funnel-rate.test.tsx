import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FunnelTracker } from '@/components/molecules/FunnelTracker';
import type { FunnelView } from '@/lib/analytics/funnel-view';

describe('Audience funnel rate column', () => {
  it('keeps the row geometry and shows a measured zero without drawing a bar', () => {
    const view: FunnelView = {
      title: 'Audience funnel',
      bottleneckId: null,
      stages: [
        {
          id: 'subscribers',
          label: 'Subscribers',
          count: 0,
          status: 'measured',
        },
      ],
    };
    const { container, rerender } = render(
      <FunnelTracker view={view} vertical />
    );
    const stage = screen.getByRole('listitem');
    const emptyRate = container.querySelector('[data-funnel-rate]');
    expect(stage).toHaveTextContent('0');
    expect(emptyRate).toHaveClass('min-w-8');
    expect(emptyRate).toBeEmptyDOMElement();

    rerender(
      <FunnelTracker
        view={{
          ...view,
          stages: [{ ...view.stages[0], count: 30, rate: '75%' }],
        }}
        vertical
      />
    );

    expect(screen.getByRole('listitem')).toBe(stage);
    expect(emptyRate).toHaveTextContent('75%');
    expect(emptyRate).toHaveClass('min-w-8');
  });
});
