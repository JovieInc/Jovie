import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { AudienceLastActionCell } from './AudienceLastActionCell';

describe('AudienceLastActionCell', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-01T15:00:00.000Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows the newest action and how long ago the member was seen', async () => {
    const { container } = render(
      <AudienceLastActionCell
        actions={[
          { label: 'Clicked Spotify link' },
          { label: 'Viewed profile' },
        ]}
        lastSeenAt='2026-09-01T12:00:00.000Z'
      />
    );

    expect(screen.getByText('Clicked Spotify Link')).toBeInTheDocument();
    expect(screen.queryByText('Viewed Profile')).toBeNull();
    expect(screen.getByText('3h ago')).toBeInTheDocument();
    expect(screen.getByText('·')).toHaveAttribute('aria-hidden', 'true');
    await expectNoA11yViolations(container);
  });

  it('renders the grammar sentence for a typed event', async () => {
    const { container } = render(
      <AudienceLastActionCell
        actions={[{ label: '', eventType: 'profile_visited' }]}
      />
    );

    expect(screen.getByText('Someone Visited Profile')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('shows only the time when there is no action', async () => {
    const { container } = render(
      <AudienceLastActionCell
        actions={[]}
        lastSeenAt='2026-09-01T14:30:00.000Z'
      />
    );

    expect(screen.getByText('30m ago')).toBeInTheDocument();
    expect(screen.queryByText('·')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('renders nothing with no action and no last-seen time', () => {
    const { container } = render(
      <AudienceLastActionCell actions={[]} lastSeenAt={null} />
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('keeps an RTL label readable', async () => {
    const { container } = render(
      <div dir='rtl'>
        <AudienceLastActionCell actions={[{ label: 'نقر على رابط' }]} />
      </div>
    );

    expect(screen.getByText('نقر على رابط')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
