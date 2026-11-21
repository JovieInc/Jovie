import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { SummerOpsCard } from '@/lib/ovie/ops-card';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ChatOpsDataCard } from './ChatOpsDataCard';

const card: SummerOpsCard = {
  schema: 'summer.ops-card.v1',
  kind: 'shipping',
  title: 'Shipping lanes',
  state: 'fresh',
  observedAt: '2026-09-27T09:00:00.000Z',
  source: 'ops',
  facts: [{ label: 'Merge queue', value: '3' }],
  series: {
    label: 'Live counts',
    points: [
      { label: 'Queued', value: 3 },
      { label: 'Running', value: 2 },
    ],
  },
};

describe('ChatOpsDataCard certificate', () => {
  it('shows facts and the chart with a sentence-case kind label', async () => {
    const { container } = render(<ChatOpsDataCard card={card} />);

    const kind = screen.getByText('Shipping');
    expect(kind.className).not.toContain('uppercase');
    expect(screen.getByText('Merge queue')).toBeInTheDocument();
    expect(screen.getByTestId('chat-ops-data-card-chart')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('shows a degraded card without facts or a series', async () => {
    const { container } = render(
      <ChatOpsDataCard
        card={{
          ...card,
          state: 'degraded',
          facts: [],
          series: null,
          observedAt: null,
        }}
        summary='Read incomplete.'
      />
    );

    expect(screen.getByText('Degraded')).toBeInTheDocument();
    expect(screen.getByText('Read incomplete.')).toBeInTheDocument();
    expect(
      screen.getByText(/Observation time unavailable/)
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
