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

    expect(metadata.title).toBe('Inbox');
  });

  it('falls back to dashboard title when profile display name is missing', async () => {
    const { generateMetadata } = await import('@/app/app/(shell)/chat/page');
    const metadata = await generateMetadata();

    expect(metadata.title).toBe('Inbox');
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
