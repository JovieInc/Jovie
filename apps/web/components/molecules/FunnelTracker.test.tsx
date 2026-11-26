import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { FunnelTracker } from './FunnelTracker';
import {
  Certification,
  Conversion,
  Empty,
  Error,
  Loading,
  LongContent,
  Offline,
  Partial,
  Rtl,
} from './FunnelTracker.stories';

describe('FunnelTracker', () => {
  it('shows a selected bottleneck and distinguishes a later pass from missing evidence', () => {
    render(
      <FunnelTracker
        view={{
          title: 'Golden Path',
          bottleneckId: 'profile',
          stages: [
            {
              id: 'profile',
              label: 'Public profile',
              status: 'failed',
              detail: 'Design check failed.',
            },
            { id: 'signup', label: 'Signup', status: 'verified' },
            { id: 'checkout', label: 'Checkout', status: 'unknown' },
          ],
        }}
      />
    );

    const stages = screen.getAllByRole('listitem');
    expect(stages[0]).toHaveAttribute('aria-current', 'step');
    expect(within(stages[0]).getByText('Failed · Bottleneck')).toBeVisible();
    expect(within(stages[1]).getByText('Verified')).toBeVisible();
    expect(within(stages[2]).getByText('Unverified')).toBeVisible();
    expect(screen.getByText(/Design check failed/)).toBeVisible();
  });

  it('shows a measured zero distinctly from an unknown count', () => {
    render(
      <FunnelTracker
        view={{
          title: 'Audience funnel',
          bottleneckId: null,
          stages: [
            { id: 'visits', label: 'Visits', status: 'measured', count: 0 },
            { id: 'subscribers', label: 'Subscribers', status: 'unknown' },
          ],
        }}
        vertical
      />
    );

    expect(screen.getByText('0')).toBeVisible();
    expect(screen.getByText('Unverified')).toBeVisible();
    expect(screen.queryByText(/Bottleneck/)).toBeNull();
  });
});

describe('FunnelTracker accessibility', () => {
  it.each([
    Certification,
    Conversion,
    Loading,
    Empty,
    Error,
    Partial,
    LongContent,
    Offline,
    Rtl,
  ])('keeps each rendered state axe-clean', async ({ args }) => {
    const { container } = render(<FunnelTracker {...args} />);
    await expectNoA11yViolations(container);
  });

  it('keeps historical, skipped, and missing evidence visibly distinct', () => {
    render(<FunnelTracker {...Partial.args} />);
    expect(screen.getByText('Stale')).toBeVisible();
    expect(screen.getByText('Skipped')).toBeVisible();
    expect(screen.getByText('Unverified')).toBeVisible();
  });

  it('allows keyboard activation of the certification evidence link', async () => {
    const href = 'https://example.com/production-receipt';
    const { container } = render(
      <FunnelTracker
        view={{
          title: 'Golden Path',
          bottleneckId: 'profile',
          stages: [
            {
              id: 'profile',
              label: 'Public profile',
              status: 'failed',
              evidenceUrl: href,
            },
          ],
        }}
      />
    );
    const link = screen.getByRole('link', { name: 'Public profile' });
    const activated = vi.fn((event: Event) => event.preventDefault());
    link.addEventListener('click', activated);

    const user = userEvent.setup();
    await user.tab();
    expect(link).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(activated).toHaveBeenCalledOnce();
    expect(link).toHaveAttribute('href', href);
    await expectNoA11yViolations(container);
  });
});
