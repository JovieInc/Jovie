import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as React from 'react';
import { queryKeys } from '@/lib/queries/keys';
import { DashboardActivityFeed } from './DashboardActivityFeed';
import type { Activity, ActivityRange } from './types';

/**
 * Certification states for the dashboard activity feed. The populated
 * default lives in DashboardActivityFeed.stories.tsx.
 */

const profileId = 'story-profile';
const range: ActivityRange = '7d';

type Fixture =
  | { readonly kind: 'data'; readonly data: Activity[] }
  | { readonly kind: 'loading' }
  | { readonly kind: 'error' }
  | { readonly kind: 'offline' };

const longActivities = Array.from({ length: 8 }, (_, index) => ({
  id: `activity-long-${index}`,
  type: 'visit',
  description:
    index === 0
      ? 'A fan from a very long referring playlist page with a remarkably descriptive title opened your profile and then clicked through to every streaming service listed'
      : `Fan ${index + 1} viewed the profile from Instagram.`,
  icon: 'visit',
  timestamp: '2026-08-31T18:20:00.000Z',
})) satisfies Activity[];

const rtlActivities = [
  {
    id: 'activity-rtl-1',
    type: 'visit',
    description: 'شاهد معجب جديد الملف الشخصي من إنستغرام.',
    icon: 'visit',
    timestamp: '2026-08-31T18:20:00.000Z',
  },
  {
    id: 'activity-rtl-2',
    type: 'click',
    description: 'نقر على استمع الآن لأغنية منتصف الليل.',
    icon: 'listen',
    timestamp: '2026-08-31T17:05:00.000Z',
  },
] satisfies Activity[];

function storyFetch(fixture: Fixture, originalFetch: typeof fetch) {
  return ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (!url.includes('/api/dashboard/activity/recent'))
      return originalFetch(input, init);
    if (fixture.kind === 'loading') return new Promise<Response>(() => {});
    if (fixture.kind === 'offline')
      return Promise.reject(new TypeError('Failed to fetch'));
    return Promise.resolve(
      new Response(JSON.stringify({ error: 'Failed to load activity' }), {
        headers: { 'content-type': 'application/json' },
        status: 500,
      })
    );
  }) as typeof fetch;
}

function createClient(fixture: Fixture) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });
  if (fixture.kind === 'data')
    client.setQueryData(
      queryKeys.dashboard.activityFeed(profileId, range),
      fixture.data
    );
  return client;
}

function ActivityFeedStateHarness({
  fixture,
  dir,
}: {
  readonly fixture: Fixture;
  readonly dir?: 'rtl';
}) {
  const client = React.useMemo(() => createClient(fixture), [fixture]);
  const [ready, setReady] = React.useState(fixture.kind === 'data');

  React.useLayoutEffect(() => {
    if (fixture.kind === 'data') return;
    const originalFetch = globalThis.fetch;
    const mocked = storyFetch(fixture, originalFetch);
    globalThis.fetch = mocked;
    setReady(true);
    return () => {
      if (globalThis.fetch === mocked) globalThis.fetch = originalFetch;
    };
  }, [fixture]);

  if (!ready) return null;

  return (
    <QueryClientProvider client={client}>
      <div dir={dir} className='w-96 max-w-full bg-base p-4 text-primary-token'>
        <DashboardActivityFeed profileId={profileId} range={range} />
      </div>
    </QueryClientProvider>
  );
}

const meta = {
  title: 'Features/Dashboard/DashboardActivityFeed/States',
  component: DashboardActivityFeed,
  parameters: { layout: 'centered' },
  args: { profileId, range },
} satisfies Meta<typeof DashboardActivityFeed>;

export default meta;
type Story = StoryObj<typeof meta>;

const LOADING: Fixture = { kind: 'loading' };
const EMPTY: Fixture = { kind: 'data', data: [] };
const ERROR: Fixture = { kind: 'error' };
const OFFLINE: Fixture = { kind: 'offline' };
const LONG: Fixture = { kind: 'data', data: longActivities };
const RTL: Fixture = { kind: 'data', data: rtlActivities };

function renderLoading() {
  return <ActivityFeedStateHarness fixture={LOADING} />;
}
function renderEmpty() {
  return <ActivityFeedStateHarness fixture={EMPTY} />;
}
function renderError() {
  return <ActivityFeedStateHarness fixture={ERROR} />;
}
function renderOffline() {
  return <ActivityFeedStateHarness fixture={OFFLINE} />;
}
function renderLong() {
  return <ActivityFeedStateHarness fixture={LONG} />;
}
function renderRtl() {
  return <ActivityFeedStateHarness fixture={RTL} dir='rtl' />;
}

/** Loading: the feed request is in flight, so the skeleton rows show. */
export const LoadingFeed: Story = { render: renderLoading };

/** Empty: no recent activity in the range. */
export const EmptyFeed: Story = { render: renderEmpty };

/** Error: the activity endpoint answers with a server error. */
export const ErrorFeed: Story = { render: renderError };

/** Offline: the network request fails before reaching the server. */
export const OfflineFeed: Story = { render: renderOffline };

/** Long content: eight rows, one with a description past a single line. */
export const LongContentFeed: Story = { render: renderLong };

/** Right-to-left: Arabic activity descriptions in a right-to-left document. */
export const RtlArabicFeed: Story = { render: renderRtl };
