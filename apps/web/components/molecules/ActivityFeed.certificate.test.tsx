import { render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActivityEvent } from '@/lib/activity/types';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ActivityFeed } from './ActivityFeed';

const NOW = new Date('2026-09-01T12:00:00.000Z');

function event(
  id: string,
  minutesAgo: number,
  overrides: Partial<ActivityEvent> = {}
): ActivityEvent {
  return {
    id,
    entityType: 'release',
    entityId: `release-${id}`,
    action: 'published',
    description: `Published links for ${id}.`,
    createdAt: new Date(NOW.getTime() - minutesAgo * 60_000),
    actor: { type: 'user', name: 'Avery' },
    ...overrides,
  };
}

describe('ActivityFeed certificate', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('announces the loading skeleton as a busy status', async () => {
    const { container } = render(<ActivityFeed events={[]} isLoading />);

    const status = screen.getByRole('status', {
      name: 'Loading Activity Feed',
    });
    expect(status).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByRole('feed')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('shows the custom empty message when there are no events', async () => {
    const { container } = render(
      <ActivityFeed events={[]} emptyMessage='Nothing has happened yet.' />
    );

    expect(screen.getByText('Nothing has happened yet.')).toBeInTheDocument();
    expect(screen.queryByRole('feed')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('names system actors and leaves partial events with only a timestamp', async () => {
    const { container } = render(
      <ActivityFeed
        events={[
          event('no-actor', 5, { actor: undefined }),
          event('system', 2 * 60, { actor: { type: 'system', name: 'Jovie' } }),
        ]}
      />
    );

    const [newest, older] = within(screen.getByRole('feed')).getAllByRole(
      'article'
    );
    expect(newest).toHaveTextContent('Published links for no-actor.');
    expect(within(newest).getByText('5m ago')).toBeInTheDocument();
    expect(within(newest).queryByText('Jovie')).toBeNull();
    expect(within(older).getByText('Jovie')).toBeInTheDocument();
    expect(within(older).getByText('2h ago')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('orders a long feed newest first and stays axe-clean in RTL', async () => {
    const events = Array.from({ length: 12 }, (_, index) =>
      event(`event-${index}`, (12 - index) * 24 * 60)
    );
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <ActivityFeed
          events={[
            ...events,
            event('arabic', 0, { description: 'تم نشر روابط الإصدار الجديد.' }),
          ]}
        />
      </div>
    );

    const articles = screen.getAllByRole('article');
    expect(articles).toHaveLength(13);
    expect(articles[0]).toHaveTextContent('تم نشر روابط الإصدار الجديد.');
    expect(within(articles[0]).getByText('just now')).toBeInTheDocument();
    expect(articles[12]).toHaveTextContent('Published links for event-0.');
    await expectNoA11yViolations(container);
  });
});
