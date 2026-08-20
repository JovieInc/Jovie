import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  SuggestedActionCard,
  type SuggestedActionCardProps,
} from '@/components/features/connectors/SuggestedActionCard';

const BASE_PROPS = {
  id: 'suggestion-1',
  title: 'Late Set at Public Records',
  startsAt: '2026-08-22T20:00:00.000Z',
  endsAt: '2026-08-22T22:00:00.000Z',
  venueName: 'Public Records',
  city: 'Brooklyn',
  region: 'NY',
  country: 'US',
  confidence: 0.96,
  rationale: 'The confirmation includes a venue and set time.',
  sourceRef: {
    messageId: 'message-1',
    subject: 'Booking confirmed for August 22',
  },
  status: 'pending',
} as const satisfies SuggestedActionCardProps;

describe('SuggestedActionCard', () => {
  it('invokes both pending actions with specific accessible names', () => {
    const onApprove = vi.fn();
    const onReject = vi.fn();
    render(
      <SuggestedActionCard
        {...BASE_PROPS}
        onApprove={onApprove}
        onReject={onReject}
      />
    );

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Approve Late Set at Public Records',
      })
    );
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Reject Late Set at Public Records',
      })
    );

    expect(onApprove).toHaveBeenCalledOnce();
    expect(onReject).toHaveBeenCalledOnce();
  });

  it('keeps read-only pending actions visible and disabled', () => {
    render(<SuggestedActionCard {...BASE_PROPS} />);

    expect(
      screen.getByRole('button', {
        name: 'Approve Late Set at Public Records',
      })
    ).toBeDisabled();
    expect(
      screen.getByRole('button', {
        name: 'Reject Late Set at Public Records',
      })
    ).toBeDisabled();
  });

  it.each([
    ['approved', 'Approved', 'info'],
    ['executed', 'Executed', 'success'],
    ['rejected', 'Rejected', 'neutral'],
    ['failed', 'Failed', 'error'],
    ['expired', 'Expired', 'neutral'],
  ] as const)('renders %s as non-interactive semantic status', (status, label, tone) => {
    const onApprove = vi.fn();
    const onReject = vi.fn();
    render(
      <SuggestedActionCard
        {...BASE_PROPS}
        status={status}
        onApprove={onApprove}
        onReject={onReject}
      />
    );

    expect(
      screen.getByRole('status', { name: `Status: ${label}` })
    ).toHaveAttribute('data-tone', tone);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(onApprove).not.toHaveBeenCalled();
    expect(onReject).not.toHaveBeenCalled();
  });

  it.each([
    [0.96, 'High Confidence, 96%', 'success'],
    [0.75, 'Medium Confidence, 75%', 'warning'],
    [0.5, 'Low Confidence, 50%', 'error'],
    [Number.NaN, 'Low Confidence, 0%', 'error'],
  ] as const)('exposes %s confidence through text and semantic tone', (confidence, accessibleName, tone) => {
    render(<SuggestedActionCard {...BASE_PROPS} confidence={confidence} />);

    expect(screen.getByLabelText(accessibleName)).toHaveAttribute(
      'data-tone',
      tone
    );
  });

  it('renders valid dates and composes a partial location without empty separators', () => {
    const { rerender } = render(
      <SuggestedActionCard
        {...BASE_PROPS}
        venueName={null}
        city='London'
        region={null}
        country='UK'
      />
    );

    expect(screen.getAllByRole('time')).toHaveLength(2);
    expect(screen.getAllByRole('time')[0]).toHaveAttribute(
      'datetime',
      BASE_PROPS.startsAt
    );
    expect(screen.getAllByRole('time')[1]).toHaveAttribute(
      'datetime',
      BASE_PROPS.endsAt
    );
    expect(screen.getByText('London, UK')).toBeInTheDocument();
    expect(screen.queryByText('Location unavailable')).not.toBeInTheDocument();

    rerender(
      <SuggestedActionCard
        {...BASE_PROPS}
        startsAt='2026-05-23'
        endsAt={null}
      />
    );
    expect(screen.getByRole('time')).toHaveAttribute('datetime', '2026-05-23');
    expect(screen.getByText('May 23, 2026')).toBeInTheDocument();
  });

  it('uses stable date, location, and source fallbacks for incomplete data', () => {
    const { rerender } = render(
      <SuggestedActionCard
        {...BASE_PROPS}
        startsAt='2026-02-30T20:00:00.000Z'
        venueName='   '
        city=' '
        region={null}
        country='  '
        sourceRef={{ messageId: 'message-2', subject: '   ' }}
      />
    );

    expect(screen.getByText('Date unavailable')).toBeInTheDocument();
    expect(screen.getByText('Location unavailable')).toBeInTheDocument();
    expect(screen.getByText('Source email unavailable')).toBeInTheDocument();
    expect(screen.getByRole('time')).toHaveAttribute(
      'datetime',
      BASE_PROPS.endsAt
    );
    expect(screen.queryByText(/Mar 2, 2026/)).not.toBeInTheDocument();

    rerender(
      <SuggestedActionCard
        {...BASE_PROPS}
        endsAt={42 as unknown as string}
        venueName={null}
        city={42 as unknown as string}
        region={null}
        country={null}
        sourceRef={{ messageId: 'message-3' } as typeof BASE_PROPS.sourceRef}
      />
    );
    expect(screen.getByText('Location unavailable')).toBeInTheDocument();
    expect(screen.getByText('Source email unavailable')).toBeInTheDocument();
    expect(screen.getAllByRole('time')).toHaveLength(1);
  });
});
