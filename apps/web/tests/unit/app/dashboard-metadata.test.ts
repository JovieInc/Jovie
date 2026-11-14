import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Children, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetSessionContext = vi.fn();
const mockLimit = vi.fn();
const mockWhere = vi.fn(() => ({ limit: mockLimit }));
const mockFrom = vi.fn(() => ({ where: mockWhere }));
const mockSelect = vi.fn(() => ({ from: mockFrom }));

vi.mock('@/lib/auth/session', () => ({
  getSessionContext: mockGetSessionContext,
}));

vi.mock('@/lib/auth/cached', () => ({
  getCachedAuth: vi.fn().mockResolvedValue({ userId: null }),
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: mockSelect,
  },
}));

// Mock heavy transitive imports that page modules pull in
vi.mock('@/app/app/(shell)/chat/ChatPageClient', () => ({
  ChatPageClient: () => null,
}));

vi.mock('@/components/onboarding/OnboardingInterviewModal', () => ({
  OnboardingInterviewModal: () => null,
}));

// Keep a stable component reference so identity checks against the page tree work.
function MockOpportunityInboxRoute() {
  return null;
}
vi.mock('@/app/app/(shell)/OpportunityInboxRoute', () => ({
  OpportunityInboxRoute: MockOpportunityInboxRoute,
}));

const mockGetDashboardShellData = vi.fn().mockResolvedValue({
  selectedProfile: null,
});
vi.mock('@/app/app/(shell)/dashboard/actions', () => ({
  getDashboardShellData: (...args: unknown[]) =>
    mockGetDashboardShellData(...args),
}));

vi.mock('@/app/app/(shell)/dashboard/releases/actions', () => ({
  loadReleaseMatrix: vi.fn().mockResolvedValue([]),
  checkAppleMusicConnection: vi.fn().mockResolvedValue({
    connected: false,
    artistName: null,
    artistId: null,
  }),
}));

vi.mock('@/lib/releases/release-matrix-loader', () => ({
  loadReleaseMatrix: vi.fn().mockResolvedValue([]),
}));

vi.mock('@/lib/queries/server', () => ({
  getQueryClient: vi.fn(() => ({
    prefetchQuery: vi.fn().mockResolvedValue(undefined),
  })),
  getDehydratedState: vi.fn(() => null),
}));

vi.mock('@/lib/queries/HydrateClient', () => ({
  HydrateClient: ({ children }: { children: ReactNode }) => children,
}));

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
}));

// Shell leaf-route metadata coverage (dogfood 2026-11-10): the page modules
// below are imported only to read their static `metadata` exports. Their
// heavy children are mocked; nothing renders here.
vi.mock('@/components/organisms/table', () => ({
  PAGE_TOOLBAR_META_TEXT_CLASS: 'test-toolbar-meta',
  PageToolbar: () => null,
}));
vi.mock('@/components/organisms/WorkspacePage', () => ({
  WorkspacePage: () => null,
}));
vi.mock('@/features/feedback/PageErrorState', () => ({
  PageErrorState: () => null,
}));
vi.mock('@/features/dashboard/insights/InsightsPanel', () => ({
  InsightsPanel: () => null,
}));
vi.mock('@/app/app/(shell)/app-shell-route-context', () => ({
  loadAppShellRouteContext: vi.fn().mockResolvedValue({
    ok: true,
    profileId: 'profile-1',
    userId: 'user-1',
    dashboardData: {
      selectedProfile: { username: 'test-artist' },
    },
  }),
}));
vi.mock('@/app/app/(shell)/links/LinksPageClient', () => ({
  LinksPageClient: () => null,
}));
vi.mock('@/app/app/(shell)/links/links-data', () => ({
  loadLinksWorkspaceData: vi
    .fn()
    .mockResolvedValue({ rows: [], loadFailed: false }),
}));
vi.mock('@/app/app/(shell)/threads/ThreadsPageClient', () => ({
  ChatsPageClient: () => null,
}));
vi.mock('@/app/app/(shell)/tour-dates/TourDatesPageClient', () => ({
  TourDatesPageClient: () => null,
}));
vi.mock('@/app/app/(shell)/dashboard/tour-dates/actions', () => ({
  loadTourDates: vi.fn().mockResolvedValue([]),
  checkBandsintownConnection: vi.fn().mockResolvedValue({
    connected: false,
    hasApiKey: false,
    artistName: null,
    lastSyncedAt: null,
  }),
}));
vi.mock('@/lib/error-tracking', () => ({
  captureError: vi.fn(),
}));
vi.mock('@/lib/queries', () => ({
  queryKeys: {
    tourDates: {
      connection: () => 'tour-dates-connection',
      list: () => 'tour-dates-list',
    },
    events: {
      list: () => 'events-list',
    },
  },
}));

const CHAT_THREAD_PAGE = resolve(
  process.cwd(),
  'app/app/(shell)/chat/[id]/page.tsx'
);
const CHAT_THREAD_METADATA_DATA = resolve(
  process.cwd(),
  'app/app/(shell)/chat/[id]/chat-thread-metadata-data.ts'
);

describe('dashboard metadata generation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSessionContext.mockResolvedValue({
      user: { id: 'user-id' },
      profile: { displayName: null },
    });
    mockLimit.mockResolvedValue([]);
  });

  it('uses the static dashboard title for the app root', async () => {
    const { generateMetadata } = await import('@/app/app/(shell)/page');
    const metadata = await generateMetadata();

    expect(metadata.title).toBe('Home');
  });

  it('uses the visible New Chat title for the chat home route', async () => {
    const { generateMetadata } = await import('@/app/app/(shell)/chat/page');
    const metadata = await generateMetadata();

    expect(metadata.title).toBe('New Chat');
  });

  it('uses conversation title for chat thread metadata when present', async () => {
    mockLimit.mockResolvedValue([{ title: 'Launch Plan' }]);

    const { generateMetadata } = await import(
      '@/app/app/(shell)/chat/[id]/page'
    );
    const metadata = await generateMetadata({
      params: Promise.resolve({ id: 'conversation-123' }),
    });

    expect(metadata.title).toBe('Launch Plan');
  });

  it('falls back to generic thread title when conversation title is missing', async () => {
    const { generateMetadata } = await import(
      '@/app/app/(shell)/chat/[id]/page'
    );
    const metadata = await generateMetadata({
      params: Promise.resolve({ id: 'conversation-123' }),
    });

    expect(metadata.title).toBe('Chat');
  });

  it('keeps chat thread metadata queries outside the page module', () => {
    const pageSource = readFileSync(CHAT_THREAD_PAGE, 'utf8');
    const dataSource = readFileSync(CHAT_THREAD_METADATA_DATA, 'utf8');

    expect(pageSource).toContain('loadChatThreadMetadataTitle');
    expect(pageSource).not.toContain('drizzle-orm');
    expect(pageSource).not.toContain('@/lib/db');
    expect(pageSource).not.toContain('@/lib/db/schema/chat');
    expect(pageSource).not.toContain('chatConversations');

    expect(dataSource).toMatch(/^import 'server-only';/);
    expect(dataSource).toContain('chatConversations');
  });

  it('home page renders the opportunity inbox route (JOV-3386)', async () => {
    const { OpportunityInboxRoute } = await import(
      '@/app/app/(shell)/OpportunityInboxRoute'
    );
    const homePage = await import('@/app/app/(shell)/page');

    const result = await homePage.default();
    const children = Children.toArray(result.props.children);

    expect(children.some(child => child.type === OpportunityInboxRoute)).toBe(
      true
    );
  });
});

// The root app layout owns `title: { template: '%s | Jovie' }`. Shell pages
// must export the bare route name so the template supplies exactly one brand
// suffix; a child title that already carries `| Jovie` renders it twice
// ('Links | Jovie | Jovie'), and a page without metadata falls back to the
// bare default and never names the route.
describe('shell leaf-route document titles', () => {
  it('names the links route and lets the layout template brand it', async () => {
    const { metadata } = await import('@/app/app/(shell)/links/page');

    expect(metadata?.title).toBe('Links');
  });

  it('names the tour dates route and lets the layout template brand it', async () => {
    const { metadata } = await import('@/app/app/(shell)/tour-dates/page');

    expect(metadata?.title).toBe('Tour Dates');
  });

  it('gives the chats route its own document title', async () => {
    const { metadata } = await import('@/app/app/(shell)/chats/page');

    expect(metadata?.title).toBe('Chats');
  });

  it('gives the insights route its own document title', async () => {
    const { metadata } = await import('@/app/app/(shell)/insights/page');

    expect(metadata?.title).toBe('Insights');
  });
});
