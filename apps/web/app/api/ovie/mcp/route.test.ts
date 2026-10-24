import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  handle: vi.fn(),
  principal: vi.fn(),
  store: vi.fn(),
}));
vi.mock('@/lib/ovie/mcp/handler', () => ({
  handleOvieMcpRequest: mocks.handle,
  UNAUTHENTICATED_WWW_AUTHENTICATE: 'Bearer realm="ovie"',
}));
vi.mock('@/lib/ovie/mcp/principal', () => ({
  resolveOviePrincipal: mocks.principal,
}));
vi.mock('@/lib/ovie/mcp/runtime-store', () => ({
  getOvieOperatingStore: mocks.store,
}));

import { GET, OPTIONS, POST } from './route';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.principal.mockResolvedValue({ authenticated: false });
  mocks.store.mockReturnValue({});
});

describe('Ovie private MCP HTTP cache boundary', () => {
  it.each([200, 401, 403])('prevents caching of %s responses', async status => {
    mocks.handle.mockResolvedValue({
      status,
      body: { marker: 'isolated-operator-control' },
    });
    const response = await POST(
      new Request('https://ovie.test/api/ovie/mcp', {
        method: 'POST',
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
      })
    );
    expect(response.status).toBe(status);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(await response.json()).toEqual({
      marker: 'isolated-operator-control',
    });
  });

  it('also prevents caching empty notifications, GET challenges and preflight', async () => {
    mocks.handle.mockResolvedValue({ status: 202, body: null });
    const notification = await POST(
      new Request('https://ovie.test/api/ovie/mcp', {
        method: 'POST',
        body: '{}',
      })
    );
    for (const response of [notification, await GET(), await OPTIONS()]) {
      expect(response.headers.get('cache-control')).toBe('private, no-store');
      expect(await response.text()).toBe('');
    }
  });
});
