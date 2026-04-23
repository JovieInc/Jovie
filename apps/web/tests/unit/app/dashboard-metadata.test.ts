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

    expect(metadata.title).toBe('Home | Jovie');
  });

  it('falls back to dashboard title when profile display name is missing', async () => {
    const { generateMetadata } = await import('@/app/app/(shell)/chat/page');
    const metadata = await generateMetadata();

    expect(metadata.title).toBe('Home | Jovie');
  });

  it('uses conversation title for chat thread metadata when present', async () => {
    mockLimit.mockResolvedValue([{ title: 'Launch Plan' }]);

    const { generateMetadata } = await import(
      '@/app/app/(shell)/chat/[id]/page'
    );
    const metadata = await generateMetadata({
      params: Promise.resolve({ id: 'conversation-123' }),
    });

    expect(metadata.title).toBe('Launch Plan | Jovie');
  });

  it('falls back to generic thread title when conversation title is missing', async () => {
    const { generateMetadata } = await import(
      '@/app/app/(shell)/chat/[id]/page'
    );
    const metadata = await generateMetadata({
      params: Promise.resolve({ id: 'conversation-123' }),
    });

    expect(metadata.title).toBe('Thread | Jovie');
  });

  it('home page renders the same chat client as /app/chat (AGENTS.md #16)', async () => {
    const { DeferredChatPageClient } = await import(
      '@/app/app/(shell)/chat/DeferredChatPageClient'
    );
    const homePage = await import('@/app/app/(shell)/page');

    const result = await homePage.default();
    const children = Children.toArray(result.props.children);

    expect(children.some(child => child.type === DeferredChatPageClient)).toBe(
      true
    );
  });
});
