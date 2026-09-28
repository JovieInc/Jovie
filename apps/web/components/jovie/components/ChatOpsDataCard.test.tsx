import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { SummerOpsCard } from '@/lib/ovie/ops-card';
import { ChatOpsDataCard } from './ChatOpsDataCard';

const card: SummerOpsCard = {
  schema: 'summer.ops-card.v1',
  kind: 'shipping',
  title: 'Shipping lanes',
  state: 'fresh',
  observedAt: '2026-09-27T09:00:00.000Z',
  source: 'ubuntu-operational-truth',
  facts: [
    { label: 'Merge queue', value: '3' },
    { label: 'Running tasks', value: '2' },
    { label: 'Blocked', value: 'Not measured' },
  ],
  series: {
    label: 'Live counts',
    points: [
      { label: 'Queued', value: 3 },
      { label: 'Running', value: 2 },
    ],
  },
};

describe('ChatOpsDataCard', () => {
  it('renders title, state pill, facts, and chart', () => {
    render(<ChatOpsDataCard card={card} />);
    const root = screen.getByTestId('chat-ops-data-card');
    expect(root).toHaveAttribute('data-card-kind', 'shipping');
    expect(root).toHaveAttribute('data-card-state', 'fresh');
    expect(screen.getByText('Shipping lanes')).toBeInTheDocument();
    expect(screen.getByTestId('chat-ops-data-card-state')).toHaveTextContent(
      'Live'
    );
    expect(screen.getByText('Merge queue')).toBeInTheDocument();
    const facts = screen.getByTestId('chat-ops-data-card-facts');
    expect(facts).toHaveTextContent('3');
    expect(facts).toHaveTextContent('Not measured');
    const chart = screen.getByTestId('chat-ops-data-card-chart');
    expect(chart).toHaveTextContent('Live counts');
    expect(chart).toHaveTextContent('Queued');
    expect(chart).toHaveTextContent('Running');
  });

  it('renders without a series and shows the observation timestamp', () => {
    render(
      <ChatOpsDataCard
        card={{ ...card, series: null }}
        summary='Shipping read complete.'
      />
    );
    expect(
      screen.queryByTestId('chat-ops-data-card-chart')
    ).not.toBeInTheDocument();
    expect(screen.getByText('Shipping read complete.')).toBeInTheDocument();
    expect(screen.getByText(/Observed/)).toBeInTheDocument();
    expect(screen.getByText(/ubuntu-operational-truth/)).toBeInTheDocument();
  });
});
