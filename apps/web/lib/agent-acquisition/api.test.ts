import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  readLimit: vi.fn(),
  writeLimit: vi.fn(),
  flag: vi.fn(),
  resolve: vi.fn(),
  create: vi.fn(),
  prepare: vi.fn(),
  read: vi.fn(),
  capture: vi.fn(),
}));
vi.mock('@/lib/rate-limit', () => ({
  publicArtistApiLimiter: { limit: mocks.readLimit },
  agentProfileCreateLimiter: { limit: mocks.writeLimit },
  getClientIP: () => '192.0.2.1',
  createRateLimitHeaders: () => ({ 'Retry-After': '60' }),
}));
vi.mock('@/lib/flags/server', () => ({ getAppFlagValue: mocks.flag }));
vi.mock('@/lib/error-tracking', () => ({ captureError: mocks.capture }));
vi.mock('./artist-resolution', () => ({ resolveAgentArtist: mocks.resolve }));
vi.mock('./draft-store', () => ({
  createAgentDraft: mocks.create,
  readAgentDraft: mocks.read,
}));
vi.mock('./release-launch', () => ({
  prepareReleaseLaunch: mocks.prepare,
}));

import { GET as mcpGet, POST as mcpPost } from '@/app/api/mcp/route';
import { BASE_URL } from '@/constants/app';
import { handleAgentDraftGet, handleAgentDraftPost } from './api';
import { verifyDraftCapability } from './draft-capability';

const artistId = 'spotify:4Z8W4fKeB5YxbusRsdQVPb';
const acquisition = {
  agent_source: 'mcp',
  client: 'test',
  first_touch: { source: 'referral' },
};
const args = { input: artistId, acquisition };
const request = (body: unknown, headers: Record<string, string> = {}) =>
  new Request(`${BASE_URL}/api/agents/drafts`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
const rpc = (
  method: string,
  params?: unknown,
  id: string | number = 'req-1'
) => ({ jsonrpc: '2.0', id, method, params });
beforeEach(() => {
  vi.resetAllMocks();
  mocks.flag.mockResolvedValue(true);
  mocks.readLimit.mockResolvedValue({ success: true });
  mocks.writeLimit.mockResolvedValue({ success: true });
  mocks.resolve.mockResolvedValue({
    status: 'resolved',
    artist: { artist_id: artistId },
    retryable: false,
  });
  mocks.create.mockResolvedValue({
    status: 'draft_ready',
    draft_id: 'draft',
    ownership: 'unverified',
  });
  mocks.prepare.mockResolvedValue({
    status: 'launch_draft_ready',
    draft_id: 'draft',
    ownership: 'unverified',
    published_url: null,
  });
  mocks.read.mockResolvedValue({ status: 'draft_ready', draft_id: 'draft' });
});
describe('shared anonymous REST/MCP draft boundary', () => {
  it('binds the resolved Apple storefront into the signed draft grant', async () => {
    mocks.resolve.mockResolvedValueOnce({
      status: 'resolved',
      artist: {
        artist_id: 'apple_music:657515',
        source_url: 'https://music.apple.com/gb/artist/657515',
      },
      retryable: false,
    });
    const response = await handleAgentDraftPost(
      request({
        tool: 'artist.search_or_import',
        arguments: {
          input: 'https://music.apple.com/gb/artist/radiohead/657515',
        },
      })
    );
    const body = await response.json();
    expect(verifyDraftCapability(body.draft_token)).toMatchObject({
      artist_id: 'apple_music:657515',
      storefront: 'gb',
    });
  });
  it('returns the same artist/acquisition contract over REST and MCP with a valid scoped capability', async () => {
    const rest = await handleAgentDraftPost(
      request({ tool: 'artist.search_or_import', arguments: args })
    );
    const mcp = await mcpPost(
      request(
        rpc('tools/call', { name: 'artist.search_or_import', arguments: args })
      )
    );
    const restBody = await rest.json();
    const rpcBody = await mcp.json();
    expect(rest.status).toBe(200);
    expect(rpcBody.id).toBe('req-1');
    for (const body of [restBody, rpcBody.result.structuredContent]) {
      expect(body).toMatchObject({
        status: 'resolved',
        artist: { artist_id: artistId },
        acquisition,
      });
      expect(verifyDraftCapability(body.draft_token)).toMatchObject({
        artist_id: artistId,
        draft_id: body.draft_id,
        acquisition,
      });
    }
    expect(JSON.parse(rpcBody.result.content[0].text)).toEqual(
      rpcBody.result.structuredContent
    );
    expect(rest.headers.get('cache-control')).toContain('no-store');
    expect(mcp.headers.get('cache-control')).toContain('no-store');
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it('keeps ambiguous identities unselected and rejects authority-bearing extra inputs', async () => {
    mocks.resolve.mockResolvedValueOnce({
      status: 'ambiguous_artist',
      candidates: [],
      retryable: false,
    });
    const result = await handleAgentDraftPost(
      request({ tool: 'artist.search_or_import', arguments: args })
    );
    expect(await result.json()).toEqual({
      status: 'ambiguous_artist',
      candidates: [],
      retryable: false,
      acquisition,
    });
    expect(
      (
        await handleAgentDraftPost(
          request({
            tool: 'artist.search_or_import',
            arguments: { ...args, publish: true },
          })
        )
      ).status
    ).toBe(400);
    expect(
      (await handleAgentDraftPost(request({ tool: 'purchase', arguments: {} })))
        .status
    ).toBe(400);
    expect(mocks.resolve).toHaveBeenCalledTimes(1);
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it('applies the existing kill switch, cross-origin denial, and fail-closed durable rate limits', async () => {
    const call = { tool: 'workspace.create_draft', arguments: {} };
    expect(
      (
        await handleAgentDraftPost(
          request(call, { origin: 'https://attacker.example' })
        )
      ).status
    ).toBe(403);
    mocks.flag.mockResolvedValueOnce(false);
    expect((await handleAgentDraftPost(request(call))).status).toBe(503);
    mocks.writeLimit.mockResolvedValueOnce({
      success: false,
      unavailable: true,
    });
    const unavailable = await handleAgentDraftPost(request(call));
    expect(unavailable.status).toBe(503);
    expect(unavailable.headers.get('retry-after')).toBe('60');
    mocks.writeLimit.mockResolvedValueOnce({ success: false });
    expect((await handleAgentDraftPost(request(call))).status).toBe(429);
    expect(mocks.create).not.toHaveBeenCalled();
    expect(
      (
        await handleAgentDraftPost(
          request(call, { origin: new URL(BASE_URL).origin })
        )
      ).status
    ).toBe(200);
  });
  it('bounds raw request bodies and redacts capability excerpts from malformed JSON telemetry', async () => {
    const secret = 'private-draft-capability';
    const bad = new Request(`${BASE_URL}/api/agents/drafts`, {
      method: 'POST',
      body: `{"draft_token":"${secret}", nope`,
    });
    const response = await handleAgentDraftPost(bad);
    expect(response.status).toBe(400);
    const captured = mocks.capture.mock.calls[0];
    expect(captured?.[1].message).toBe('Invalid JSON');
    expect(JSON.stringify(captured)).not.toContain(secret);
    expect(
      (
        await handleAgentDraftPost(
          new Request(`${BASE_URL}/api/agents/drafts`, {
            method: 'POST',
            body: 'a'.repeat(16385),
          })
        )
      ).status
    ).toBe(413);
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it('resumes through bearer headers only and maps missing drafts without disclosure', async () => {
    const url = `${BASE_URL}/api/agents/drafts/draft?draft_token=ignored`;
    await handleAgentDraftGet(new Request(url), 'draft');
    expect(mocks.read).toHaveBeenLastCalledWith('draft', '');
    mocks.read.mockResolvedValueOnce({
      status: 'error',
      code: 'DRAFT_UNAVAILABLE',
    });
    expect(
      (
        await handleAgentDraftGet(
          new Request(url, {
            headers: { authorization: 'Bearer private.token' },
          }),
          'draft'
        )
      ).status
    ).toBe(404);
    expect(mocks.read).toHaveBeenLastCalledWith('draft', 'private.token');
  });
  it('negotiates protocols, lists only draft tools, accepts notifications, and declines SSE', async () => {
    const init = await mcpPost(
      request(rpc('initialize', { protocolVersion: '2025-06-18' }))
    );
    const initBody = await init.json();
    expect(initBody).toMatchObject({
      id: 'req-1',
      result: { protocolVersion: '2025-06-18', capabilities: { tools: {} } },
    });
    expect(initBody.result.instructions).toContain(
      'Resolve an exact public creator profile'
    );
    expect(initBody.result.instructions).not.toContain('public artist');
    const latest = await mcpPost(
      request(rpc('initialize', { protocolVersion: 'unknown' }))
    );
    expect((await latest.json()).result.protocolVersion).toBe('2025-11-25');
    const list = await mcpPost(request(rpc('tools/list')));
    expect(
      (await list.json()).result.tools.map(
        (tool: { name: string }) => tool.name
      )
    ).toEqual([
      'artist.search_or_import',
      'workspace.create_draft',
      'release.prepare_launch',
    ]);
    const ping = await mcpPost(request(rpc('ping', undefined, 0)));
    expect(await ping.json()).toEqual({ jsonrpc: '2.0', id: 0, result: {} });
    const notification = await mcpPost(
      request({ jsonrpc: '2.0', method: 'notifications/initialized' })
    );
    expect(notification.status).toBe(202);
    expect(await notification.text()).toBe('');
    expect(mcpGet(new Request(BASE_URL)).status).toBe(405);
    expect(
      mcpGet(
        new Request(BASE_URL, {
          headers: { origin: 'https://attacker.example' },
        })
      ).status
    ).toBe(403);
  });
  it('rejects malformed RPC, unsupported versions/methods/tools and mutation notifications', async () => {
    expect(
      (
        await mcpPost(
          request(rpc('ping'), { 'mcp-protocol-version': '1900-01-01' })
        )
      ).status
    ).toBe(400);
    for (const body of [
      [],
      { jsonrpc: '1.0', id: 1 },
      {
        jsonrpc: '2.0',
        method: 'tools/call',
        params: { name: 'workspace.create_draft', arguments: {} },
      },
    ])
      expect((await mcpPost(request(body))).status).toBe(400);
    const missing = await mcpPost(request(rpc('resources/list')));
    expect(await missing.json()).toMatchObject({
      id: 'req-1',
      error: { code: -32601 },
    });
    for (const params of [undefined, { name: 'publish' }]) {
      const invalid = await mcpPost(request(rpc('tools/call', params)));
      expect(await invalid.json()).toMatchObject({
        id: 'req-1',
        error: { code: -32602 },
      });
    }
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it('uses the same create service and reports domain errors as tool results', async () => {
    const input = { artist_id: artistId, draft_token: 'private.token' };
    await handleAgentDraftPost(
      request({ tool: 'workspace.create_draft', arguments: input })
    );
    expect(mocks.create).toHaveBeenLastCalledWith(input);
    const launchInput = {
      draft_id: '9efebd98-39b7-4a77-8965-04b5aafad9ad',
      draft_token: 'private.token',
      release_url: 'https://open.spotify.com/album/release-id',
      goal: 'Launch the single',
    };
    await handleAgentDraftPost(
      request({ tool: 'release.prepare_launch', arguments: launchInput })
    );
    expect(mocks.prepare).toHaveBeenLastCalledWith(launchInput);
    for (const code of [
      'DRAFT_UNAVAILABLE',
      'ARTIST_NOT_FOUND',
      'RELEASE_NOT_FOUND',
    ]) {
      mocks.create.mockResolvedValueOnce({
        status: 'error',
        code,
        retryable: false,
      });
      expect(
        (
          await handleAgentDraftPost(
            request({ tool: 'workspace.create_draft', arguments: input })
          )
        ).status
      ).toBe(404);
    }
    mocks.create.mockResolvedValueOnce({
      status: 'error',
      code: 'DRAFT_UNAVAILABLE',
      retryable: false,
    });
    const failure = await mcpPost(
      request(
        rpc('tools/call', { name: 'workspace.create_draft', arguments: input })
      )
    );
    expect(await failure.json()).toMatchObject({
      result: {
        isError: true,
        structuredContent: { code: 'DRAFT_UNAVAILABLE' },
      },
    });
    mocks.create.mockResolvedValueOnce({
      status: 'error',
      code: 'UPSTREAM_FAILURE',
      retryable: true,
    });
    expect(
      (
        await handleAgentDraftPost(
          request({ tool: 'workspace.create_draft', arguments: input })
        )
      ).status
    ).toBe(503);
  });
  it('sanitizes unexpected failures while preserving the JSON-RPC request identity', async () => {
    const privateError = new Error('database SQL with private.token');
    mocks.create.mockRejectedValue(privateError);
    const response = await mcpPost(
      request(
        rpc(
          'tools/call',
          { name: 'workspace.create_draft', arguments: {} },
          'failed-request'
        )
      )
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      id: 'failed-request',
      error: { code: -32603 },
    });
    const rest = await handleAgentDraftPost(
      request({ tool: 'workspace.create_draft', arguments: {} })
    );
    expect(rest.status).toBe(503);
    mocks.read.mockRejectedValue(privateError);
    expect(
      (await handleAgentDraftGet(new Request(BASE_URL), 'draft')).status
    ).toBe(503);
    for (const call of mocks.capture.mock.calls)
      expect(call[1].message).toBe('Agent draft service failure');
  });
});
