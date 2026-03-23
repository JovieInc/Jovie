import { describe, expect, it } from 'vitest';
import {
  normalizeDashboardActivityIcon,
  parseDashboardActivityFeedResponse,
} from '@/lib/activity/dashboard-feed';

describe('dashboard activity feed contract', () => {
  it('normalizes legacy emoji icons and unknown icon values', () => {
    expect(normalizeDashboardActivityIcon('🎧')).toBe('listen');
    expect(normalizeDashboardActivityIcon('📩')).toBe('email');
    expect(normalizeDashboardActivityIcon('unexpected')).toBe('link');
  });

  it('coerces valid rows and drops malformed activity entries', () => {
    expect(
      parseDashboardActivityFeedResponse({
        activities: [
          {
            id: 'activity-1',
            type: 'click',
            description: 'Legacy listen click',
            icon: '🎧',
            timestamp: '2026-03-23T00:00:00.000Z',
            href: '/app/dashboard/audience',
          },
          {
            id: 'activity-2',
            type: 'click',
            description: 'Unknown icon fallback',
            icon: 'totally-unknown',
            timestamp: '2026-03-23T01:00:00.000Z',
            href: 42,
          },
          {
            id: 7,
            type: 'click',
            description: 'Malformed row',
            icon: 'listen',
            timestamp: '2026-03-23T02:00:00.000Z',
          },
        ],
      })
    ).toEqual([
      {
        id: 'activity-1',
        type: 'click',
        description: 'Legacy listen click',
        icon: 'listen',
        timestamp: '2026-03-23T00:00:00.000Z',
        href: '/app/dashboard/audience',
      },
      {
        id: 'activity-2',
        type: 'click',
        description: 'Unknown icon fallback',
        icon: 'link',
        timestamp: '2026-03-23T01:00:00.000Z',
      },
    ]);
  });
});
