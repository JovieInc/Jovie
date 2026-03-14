import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetSessionContext = vi.fn();
const mockLimit = vi.fn();
const mockWhere = vi.fn(() => ({ limit: mockLimit }));
const mockFrom = vi.fn(() => ({ where: mockWhere }));
const mockSelect = vi.fn(() => ({ from: mockFrom }));

vi.mock('@/lib/auth/session', () => ({
  getSessionContext: mockGetSessionContext,
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

vi.mock('@/app/app/(shell)/dashboard/actions', () => ({
  getDashboardData: vi.fn().mockResolvedValue({}),
}));

// Mock releases actions to simulate an Apple Music disconnected response.
vi.mock('@/app/app/(shell)/dashboard/releases/actions', () => ({
  checkAppleMusicConnection: vi.fn().mockResolvedValue({
    connected: false,
    artistName: null,
    artistId: null,
  }),
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

  it('uses display name for app root tab title when available', async () => {
    mockGetSessionContext.mockResolvedValue({
      user: { id: 'user-id' },
      profile: { displayName: 'Ada' },
    });

    const { generateMetadata } = await import('@/app/app/(shell)/page');
    const metadata = await generateMetadata();

    expect(metadata.title).toBe('Ada | Jovie');
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
});
