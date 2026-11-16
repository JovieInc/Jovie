import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { SuggestedActionCard } from './SuggestedActionCard';

type Props = ComponentProps<typeof SuggestedActionCard>;

const BASE: Props = {
  id: 'suggestion',
  title: 'Late Set at Public Records',
  startsAt: '2026-08-22T20:00:00.000Z',
  endsAt: '2026-08-22T22:00:00.000Z',
  venueName: 'Public Records',
  city: 'Brooklyn',
  region: 'NY',
  country: 'US',
  confidence: 0.96,
  rationale: 'The confirmation includes a venue and set time.',
  sourceRef: { messageId: 'message-1', subject: 'Booking confirmed' },
  status: 'pending',
};

describe('SuggestedActionCard certificate', () => {
  it('approves and rejects a pending suggestion', async () => {
    const user = userEvent.setup();
    const onApprove = vi.fn();
    const onReject = vi.fn();
    const { container } = render(
      <SuggestedActionCard
        {...BASE}
        onApprove={onApprove}
        onReject={onReject}
      />
    );

    expect(
      screen.getByRole('heading', { name: 'Late Set at Public Records' })
    ).toBeInTheDocument();
    expect(screen.getByLabelText('High Confidence, 96%')).toBeInTheDocument();
    expect(
      screen.getByText('Public Records, Brooklyn, NY, US')
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: 'Approve Late Set at Public Records' })
    );
    await user.click(
      screen.getByRole('button', { name: 'Reject Late Set at Public Records' })
    );
    expect(onApprove).toHaveBeenCalledTimes(1);
    expect(onReject).toHaveBeenCalledTimes(1);
    await expectNoA11yViolations(container);
  });

  it('disables both actions when no handler is wired', async () => {
    const { container } = render(<SuggestedActionCard {...BASE} />);

    expect(screen.getByRole('button', { name: /^Approve/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /^Reject/ })).toBeDisabled();
    await expectNoA11yViolations(container);
  });

  it('shows the failed status instead of actions', async () => {
    const { container } = render(
      <SuggestedActionCard {...BASE} status='failed' confidence={0.55} />
    );

    expect(
      screen.getByRole('status', { name: 'Status: Failed' })
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Low Confidence, 55%')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('falls back when date, place and subject are missing', async () => {
    const { container } = render(
      <SuggestedActionCard
        {...BASE}
        startsAt='TBD'
        endsAt={null}
        venueName={null}
        city={null}
        region={null}
        country={null}
        confidence={Number.NaN}
        sourceRef={{ messageId: 'm', subject: '   ' }}
        status='expired'
      />
    );

    expect(screen.getByText('Date unavailable')).toBeInTheDocument();
    expect(screen.getByText('Location unavailable')).toBeInTheDocument();
    expect(screen.getByText('Source email unavailable')).not.toHaveAttribute(
      'title'
    );
    expect(screen.getByLabelText('Low Confidence, 0%')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('formats a date-only start and a partial location', async () => {
    const { container } = render(
      <SuggestedActionCard
        {...BASE}
        startsAt='2026-08-22'
        endsAt={null}
        venueName={null}
        region=' '
        country={null}
        confidence={0.78}
        status='executed'
      />
    );

    expect(screen.getByText('Aug 22, 2026')).toHaveAttribute(
      'datetime',
      '2026-08-22'
    );
    expect(screen.getByText('Brooklyn')).toBeInTheDocument();
    expect(screen.getByLabelText('Medium Confidence, 78%')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('keeps long copy whole in a right-to-left document', async () => {
    const subject =
      'RE: FWD: Booking confirmed for August 22, load-in, set times and guest list';
    const { container } = render(
      <div dir='rtl'>
        <SuggestedActionCard
          {...BASE}
          title='عرض متأخر في Public Records'
          sourceRef={{ messageId: 'm', subject }}
        />
      </div>
    );

    expect(screen.getByText(subject)).toHaveAttribute('title', subject);
    expect(
      screen.getByRole('heading', { name: 'عرض متأخر في Public Records' })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
