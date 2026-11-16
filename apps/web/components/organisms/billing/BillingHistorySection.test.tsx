import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { useBillingHistoryQuery } from '@/lib/queries';
import type { BillingHistoryEntry } from '@/lib/queries/useBillingHistoryQuery';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { BillingHistorySection } from './BillingHistorySection';

type HistoryQuery = ReturnType<typeof useBillingHistoryQuery>;

function historyQuery(
  fields: Partial<Pick<HistoryQuery, 'isLoading' | 'error' | 'data'>>
): HistoryQuery {
  return {
    isLoading: false,
    error: null,
    data: undefined,
    ...fields,
  } as unknown as HistoryQuery;
}

const entries: BillingHistoryEntry[] = [
  {
    eventType: 'subscription_created',
    timestamp: '2026-09-01T12:00:00.000Z',
    amount: 1200,
    currency: 'usd',
    status: 'paid',
    maskedIdentifier: 'evt_1',
  },
  {
    eventType: 'invoice.voided_by_support',
    timestamp: '2026-08-01T12:00:00.000Z',
    amount: null,
    currency: null,
    status: null,
    maskedIdentifier: 'evt_2',
  },
];

describe('BillingHistorySection', () => {
  it('shows skeleton rows and no message while loading', async () => {
    const { container } = render(
      <BillingHistorySection historyQuery={historyQuery({ isLoading: true })} />
    );

    expect(screen.getByText('Billing History')).toBeInTheDocument();
    expect(
      screen.queryByText('Unable to load billing history.')
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText('No billing events yet.')
    ).not.toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('says the history could not load when the query fails', async () => {
    const { container } = render(
      <BillingHistorySection
        historyQuery={historyQuery({ error: new Error('500') })}
      />
    );

    expect(
      screen.getByText('Unable to load billing history.')
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('shows the empty message when there are no events', async () => {
    const { container } = render(
      <BillingHistorySection
        historyQuery={historyQuery({ data: { entries: [] } })}
      />
    );

    expect(screen.getByText('No billing events yet.')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('lists each event with its label, status badge and date', async () => {
    const { container } = render(
      <BillingHistorySection
        historyQuery={historyQuery({ data: { entries } })}
      />
    );

    expect(screen.getByText('Subscription started')).toBeInTheDocument();
    expect(screen.getByText('Paid')).toBeInTheDocument();
    // Unmapped event types fall back to spaced words; no status reads Billing.
    expect(screen.getByText('invoice voided by support')).toBeInTheDocument();
    expect(screen.getByText('Billing')).toBeInTheDocument();
    expect(container.querySelectorAll('time')).toHaveLength(2);
    await expectNoA11yViolations(container);
  });
});
