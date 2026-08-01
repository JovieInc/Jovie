/**
 * JSON-RPC id echo regression tests for /api/mcp/[username].
 *
 * JSON-RPC 2.0 §5 requires the response `id` to match the request `id` exactly.
 * Previously mcpOk/mcpError hardcoded `id: 1`, breaking clients that send any
 * other id or multiple concurrent requests.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Hoist mocks
// ---------------------------------------------------------------------------
const hoisted = vi.hoisted(() => ({
  getCachedAuth: vi.fn(),
  getProfileByUsername: vi.fn(),
  getReleasesForProfileLite: vi.fn(),
  getLiveMerchCardsForProfile: vi.fn(),
  getUpcomingTourDatesForProfile: vi.fn(),
  createMerchGeneration: vi.fn(),
  selectMerchDesign: vi.fn(),
  publishMerchCard: vi.fn(),
  proposeMerchAction: vi.fn(),
}));

vi.mock('server-only', () => ({}));

vi.mock('@/lib/services/profile', () => ({
  getProfileByUsername: hoisted.getProfileByUsername,
}));

vi.mock('@/lib/auth/cached', () => ({
  getCachedAuth: hoisted.getCachedAuth,
}));

vi.mock('@/lib/chat/tools/merch-propose', () => ({
  proposeMerchAction: hoisted.proposeMerchAction,
}));

vi.mock('@/lib/discography/queries', () => ({
  getReleasesForProfileLite: hoisted.getReleasesForProfileLite,
}));

vi.mock('@/lib/merch/service', () => ({
  createMerchGeneration: hoisted.createMerchGeneration,
  getLiveMerchCardsForProfile: hoisted.getLiveMerchCardsForProfile,
  publishMerchCard: hoisted.publishMerchCard,
  selectMerchDesign: hoisted.selectMerchDesign,
}));

vi.mock('@/lib/tour-dates/queries', () => ({
  getUpcomingTourDatesForProfile: hoisted.getUpcomingTourDatesForProfile,
}));

vi.mock('@/constants/app', () => ({ BASE_URL: 'https://jov.ie' }));

vi.mock('@/lib/http/headers', () => ({ NO_STORE_HEADERS: {} }));

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------
const FAKE_PROFILE = {
  id: 'p1',
  username: 'artist1',
  displayName: 'Artist One',
  isPublic: true,
  bio: null,
  location: null,
  genres: [],
  avatarUrl: null,
  spotifyUrl: null,
  appleMusicUrl: null,
  youtubeUrl: null,
};

function makeRequest(body: unknown) {
  return new Request('https://jov.ie/api/mcp/artist1', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('POST /api/mcp/[username] — JSON-RPC id echo', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    hoisted.getProfileByUsername.mockResolvedValue(FAKE_PROFILE);
    hoisted.getReleasesForProfileLite.mockResolvedValue([]);
    hoisted.getLiveMerchCardsForProfile.mockResolvedValue([]);
    hoisted.getUpcomingTourDatesForProfile.mockResolvedValue([]);
    hoisted.getCachedAuth.mockResolvedValue({ userId: null });
    hoisted.createMerchGeneration.mockResolvedValue({
      success: true,
      generationId: '00000000-0000-0000-0000-000000000001',
      options: [],
    });
    hoisted.selectMerchDesign.mockResolvedValue({
      success: true,
      merchCardId: '00000000-0000-4000-8000-000000000002',
      status: 'draft',
    });
    hoisted.proposeMerchAction.mockResolvedValue({
      success: true,
      action: 'publish_merch',
      merchCardId: '00000000-0000-4000-8000-000000000002',
      title: 'Tour Tee',
      currentStatus: 'draft',
      retailPrice: '$25.00',
      primaryImageUrl: null,
    });
    hoisted.publishMerchCard.mockResolvedValue({
      id: '00000000-0000-4000-8000-000000000002',
      status: 'live',
      title: 'Tour Tee',
    });
  });

  it('echoes a numeric request id in the success response', async () => {
    const { POST } = await import('./route');
    const res = await POST(
      makeRequest({ jsonrpc: '2.0', id: 42, method: 'initialize' }),
      {
        params: Promise.resolve({ username: 'artist1' }),
      }
    );

    const body = await res.json();
    expect(body.id).toBe(42);
    expect(body.result).toBeDefined();
  });

  it('echoes a string request id in the success response', async () => {
    const { POST } = await import('./route');
    const res = await POST(
      makeRequest({ jsonrpc: '2.0', id: 'req-abc', method: 'resources/list' }),
      { params: Promise.resolve({ username: 'artist1' }) }
    );

    const body = await res.json();
    expect(body.id).toBe('req-abc');
    expect(body.result).toBeDefined();
  });

  it('echoes null id when request id is explicitly null', async () => {
    const { POST } = await import('./route');
    const res = await POST(
      makeRequest({ jsonrpc: '2.0', id: null, method: 'tools/list' }),
      { params: Promise.resolve({ username: 'artist1' }) }
    );

    const body = await res.json();
    expect(body).toHaveProperty('id', null);
  });

  it('omits id when request has no id (notification)', async () => {
    const { POST } = await import('./route');
    const res = await POST(
      makeRequest({ jsonrpc: '2.0', method: 'initialize' }),
      { params: Promise.resolve({ username: 'artist1' }) }
    );

    const body = await res.json();
    expect(Object.prototype.hasOwnProperty.call(body, 'id')).toBe(false);
  });

  it('echoes id in error responses (invalid method)', async () => {
    const { POST } = await import('./route');
    const res = await POST(
      makeRequest({ jsonrpc: '2.0', id: 7, method: 'unknown/method' }),
      { params: Promise.resolve({ username: 'artist1' }) }
    );

    const body = await res.json();
    expect(body.id).toBe(7);
    expect(body.error).toBeDefined();
  });

  it('does not hardcode id: 1 (regression guard)', async () => {
    const { POST } = await import('./route');
    const res = await POST(
      makeRequest({ jsonrpc: '2.0', id: 99, method: 'initialize' }),
      { params: Promise.resolve({ username: 'artist1' }) }
    );

    const body = await res.json();
    expect(body.id).not.toBe(1);
    expect(body.id).toBe(99);
  });

  it('uses null id for parse error (body is not valid JSON / unreadable)', async () => {
    const { POST } = await import('./route');
    // Send non-JSON body to trigger the parse error path
    const req = new Request('https://jov.ie/api/mcp/artist1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not json{{{',
    });

    const res = await POST(req, {
      params: Promise.resolve({ username: 'artist1' }),
    });
    const body = await res.json();
    expect(body.id).toBeNull();
    expect(body.error).toBeDefined();
  });

  it('lists agent-native merch write tools without exposing them as public reads', async () => {
    const { POST } = await import('./route');
    const res = await POST(
      makeRequest({ jsonrpc: '2.0', id: 8, method: 'tools/list' }),
      { params: Promise.resolve({ username: 'artist1' }) }
    );
    const body = await res.json();
    const names = body.result.tools.map((tool: { name: string }) => tool.name);
    expect(names).toEqual(
      expect.arrayContaining([
        'generate_merch',
        'select_merch_design',
        'publish_merch_card',
      ])
    );
  });

  it('rejects merch generation without an authenticated owner session', async () => {
    const { POST } = await import('./route');
    const res = await POST(
      makeRequest({
        jsonrpc: '2.0',
        id: 9,
        method: 'tools/call',
        params: { name: 'generate_merch', arguments: { prompt: 'tour tee' } },
      }),
      { params: Promise.resolve({ username: 'artist1' }) }
    );
    const body = await res.json();
    expect(body.error.message).toContain('Authentication required');
    expect(hoisted.createMerchGeneration).not.toHaveBeenCalled();
  });

  it('routes generation through the canonical merch service with the session owner', async () => {
    hoisted.getCachedAuth.mockResolvedValue({ userId: 'owner-1' });
    const { POST } = await import('./route');
    await POST(
      makeRequest({
        jsonrpc: '2.0',
        id: 10,
        method: 'tools/call',
        params: {
          name: 'generate_merch',
          arguments: { prompt: 'tour tee', itemType: 'hoodie' },
        },
      }),
      { params: Promise.resolve({ username: 'artist1' }) }
    );
    expect(hoisted.createMerchGeneration).toHaveBeenCalledWith({
      profileId: 'p1',
      clerkUserId: 'owner-1',
      prompt: 'tour tee\nItem type: hoodie',
      command: 'create_merch',
    });
  });

  it('returns a publish proposal after selecting a draft design', async () => {
    hoisted.getCachedAuth.mockResolvedValue({ userId: 'owner-1' });
    const { POST } = await import('./route');
    const res = await POST(
      makeRequest({
        jsonrpc: '2.0',
        id: 11,
        method: 'tools/call',
        params: {
          name: 'select_merch_design',
          arguments: {
            generationId: '00000000-0000-4000-8000-000000000001',
            optionNumber: 1,
          },
        },
      }),
      { params: Promise.resolve({ username: 'artist1' }) }
    );
    const body = await res.json();
    expect(body.result.content[0].text).toContain('publishProposal');
    expect(hoisted.selectMerchDesign).toHaveBeenCalledWith({
      generationId: '00000000-0000-4000-8000-000000000001',
      clerkUserId: 'owner-1',
      optionNumber: 1,
      optionId: undefined,
      publish: false,
    });
  });

  it('requires explicit confirmation before publishing and then uses the canonical publisher', async () => {
    hoisted.getCachedAuth.mockResolvedValue({ userId: 'owner-1' });
    const { POST } = await import('./route');
    const proposal = await POST(
      makeRequest({
        jsonrpc: '2.0',
        id: 11,
        method: 'tools/call',
        params: {
          name: 'publish_merch_card',
          arguments: {
            merchCardId: '00000000-0000-4000-8000-000000000002',
          },
        },
      }),
      { params: Promise.resolve({ username: 'artist1' }) }
    );
    const proposalBody = await proposal.json();
    expect(proposalBody.result.content[0].text).toContain('confirmed');
    expect(hoisted.publishMerchCard).not.toHaveBeenCalled();

    await POST(
      makeRequest({
        jsonrpc: '2.0',
        id: 12,
        method: 'tools/call',
        params: {
          name: 'publish_merch_card',
          arguments: {
            merchCardId: '00000000-0000-4000-8000-000000000002',
            confirmed: true,
          },
        },
      }),
      { params: Promise.resolve({ username: 'artist1' }) }
    );
    expect(hoisted.publishMerchCard).toHaveBeenCalledWith({
      cardId: '00000000-0000-4000-8000-000000000002',
      profileId: 'p1',
      clerkUserId: 'owner-1',
    });
  });

  it('returns 404 with null id when artist is not found (pre-body-parse)', async () => {
    hoisted.getProfileByUsername.mockResolvedValue(null);
    const { POST } = await import('./route');
    const res = await POST(
      makeRequest({ jsonrpc: '2.0', id: 5, method: 'initialize' }),
      { params: Promise.resolve({ username: 'nobody' }) }
    );

    expect(res.status).toBe(404);
    const body = await res.json();
    // Before body is parsed we cannot echo the client id; spec says use null
    expect(body.id).toBeNull();
    expect(body.error).toBeDefined();
  });
});
