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
  getProfileByUsername: vi.fn(),
  getReleasesForProfileLite: vi.fn(),
  getLiveMerchCardsForProfile: vi.fn(),
  getUpcomingTourDatesForProfile: vi.fn(),
}));

vi.mock('server-only', () => ({}));

vi.mock('@/lib/services/profile', () => ({
  getProfileByUsername: hoisted.getProfileByUsername,
}));

vi.mock('@/lib/discography/queries', () => ({
  getReleasesForProfileLite: hoisted.getReleasesForProfileLite,
}));

vi.mock('@/lib/merch/service', () => ({
  getLiveMerchCardsForProfile: hoisted.getLiveMerchCardsForProfile,
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
