import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/wiki/gbrain-client', () => ({
  searchPages: vi.fn(async (query: string) => [
    { slug: 'ovie-mcp', title: `hit:${query}`, score: 0.9 },
  ]),
  getPage: vi.fn(async (slug: string) =>
    slug === 'ovie-mcp'
      ? { slug, title: 'Ovie MCP', compiled_truth: 'read-only' }
      : null
  ),
}));

import {
  bindEveIdentityForTurn,
  eveIdentityForMcpDoor,
} from '@/lib/ovie/identity';
import { handleOvieMcpRequest } from '@/lib/ovie/mcp/handler';
import {
  getOvieOAuthIssuer,
  isAllowedRedirect,
  isOvieOAuthFounder,
  ovieFounderLoginLocation,
  pkceS256,
} from '@/lib/ovie/mcp/oauth';
import {
  DurableOperatingStore,
  FailoverOperatingStore,
  MemoryOperatingStore,
  memoryRecordBackend,
  type RecordBackend,
} from '@/lib/ovie/mcp/store';
import { OVIE_MCP_TOOLS } from '@/lib/ovie/mcp/types';

const founder = {
  authenticated: true,
  isAdmin: true,
  scopes: ['ovie:read', 'ovie:write'] as const,
};
const guest = { authenticated: false, isAdmin: false, scopes: [] as const };
const user = {
  authenticated: true,
  isAdmin: false,
  scopes: ['ovie:read'] as const,
};

function rpc(method: string, params?: unknown, id: string | number = 'req-1') {
  return { jsonrpc: '2.0', id, method, params };
}

function toolResult<T>(body: unknown): T {
  return (body as { result: { structuredContent: T } }).result
    .structuredContent;
}

describe('Ovie MCP handler', () => {
  it('rejects unauthenticated initialize', async () => {
    const result = await handleOvieMcpRequest({
      body: rpc('initialize', {}, 42),
      principal: guest,
    });
    expect(result.status).toBe(401);
    expect(result.body).toMatchObject({
      jsonrpc: '2.0',
      id: 42,
      error: { message: 'authentication required' },
    });
    expect(result.headers?.['www-authenticate']).toContain('resource_metadata');
  });

  it('echoes JSON-RPC id and lists the Ovie tools', async () => {
    const result = await handleOvieMcpRequest({
      body: rpc('tools/list', {}, 'list-7'),
      principal: founder,
    });
    expect(result.status).toBe(200);
    const body = result.body as {
      id: string;
      result: { tools: Array<{ name: string }> };
    };
    expect(body.id).toBe('list-7');
    expect(body.result.tools.map(tool => tool.name)).toEqual([
      ...OVIE_MCP_TOOLS,
    ]);
    expect(
      body.result.tools.some(tool => tool.name === 'get_ticket_link')
    ).toBe(false);
  });

  it('binds Ovie, not artist Jovie', () => {
    expect(eveIdentityForMcpDoor().id).toBe('ovie');
    expect(eveIdentityForMcpDoor().role).toBe('founder');
    expect(bindEveIdentityForTurn('ovie').pack.id).toBe('ovie');
    expect(() =>
      bindEveIdentityForTurn('jovie').require('ingest-ack')
    ).toThrow();
  });

  it('rejects non-founder writes', async () => {
    const result = await handleOvieMcpRequest({
      body: rpc('tools/call', {
        name: 'create_initiative',
        arguments: { title: 'x', intent: 'y' },
      }),
      principal: user,
    });
    expect(result.status).toBe(403);
  });

  it('round-trips create_initiative then get_initiative without spawning', async () => {
    const backend = memoryRecordBackend();
    const created = await handleOvieMcpRequest({
      store: new MemoryOperatingStore(backend),
      principal: founder,
      body: rpc(
        'tools/call',
        {
          name: 'create_initiative',
          arguments: {
            title: 'Public Artist Profile Certification',
            intent: 'Map and certify launch-critical profile capabilities',
            desired_outcome: 'Launch-ready public profiles',
            why: 'Cannot ship uncertified profiles',
            provenance: 'chatgpt-mcp-dogfood',
            priority: 'engineering',
          },
        },
        'c1'
      ),
    });
    expect(created.status).toBe(200);
    const createdBody = toolResult<{
      id: string;
      workerSpawned: boolean;
      status: string;
      evidence: Array<{ summary: string }>;
      receipts: Array<{ destination: string }>;
      handoff: {
        title: string;
        desired_outcome?: string;
        provenance?: string;
      };
    }>(created.body);
    expect((created.body as { id: string }).id).toBe('c1');
    expect(createdBody.workerSpawned).toBe(false);
    expect(createdBody.id).toMatch(/^ini_[A-Za-z0-9_-]{8,24}$/);
    expect(createdBody.id.includes('.')).toBe(false);
    expect(createdBody.id.length).toBeLessThan(48);
    expect(createdBody.evidence.length).toBeGreaterThan(0);
    expect(createdBody.receipts.length).toBeGreaterThan(0);
    expect(createdBody.handoff.desired_outcome).toBe(
      'Launch-ready public profiles'
    );
    expect(createdBody.handoff.provenance).toBe('chatgpt-mcp-dogfood');

    const fetched = await handleOvieMcpRequest({
      store: new MemoryOperatingStore(backend),
      principal: founder,
      body: rpc(
        'tools/call',
        { name: 'get_initiative', arguments: { id: createdBody.id } },
        'g1'
      ),
    });
    const fetchedBody = toolResult<{
      id: string;
      complete: boolean;
      merged_is_not_complete: boolean;
      evidence: Array<{ summary: string }>;
      receipts: Array<{ destination: string }>;
      handoff: {
        title: string;
        desired_outcome?: string;
        why?: string;
        provenance?: string;
      };
    }>(fetched.body);
    expect(fetchedBody.id).toBe(createdBody.id);
    expect(fetchedBody.complete).toBe(false);
    expect(fetchedBody.merged_is_not_complete).toBe(true);
    expect(fetchedBody.evidence).toEqual(createdBody.evidence);
    expect(fetchedBody.receipts).toEqual(createdBody.receipts);
    expect(fetchedBody.handoff.desired_outcome).toBe(
      createdBody.handoff.desired_outcome
    );
    expect(fetchedBody.handoff.why).toBe('Cannot ship uncertified profiles');
    expect(fetchedBody.handoff.provenance).toBe('chatgpt-mcp-dogfood');

    const isolated = await handleOvieMcpRequest({
      store: new MemoryOperatingStore(),
      principal: founder,
      body: rpc(
        'tools/call',
        { name: 'get_initiative', arguments: { id: createdBody.id } },
        'g-miss'
      ),
    });
    expect(isolated.status).toBe(200);
    expect(isolated.body).toMatchObject({
      error: { message: `unknown initiative ${createdBody.id}` },
    });
  });

  it('returns evidence after Redis quota by reading a second fallback store', async () => {
    const durable = memoryRecordBackend();
    const quota = new Error('ERR max requests limit exceeded. Limit: 500000');
    const failingPrimary = new DurableOperatingStore({
      get: async () => {
        throw quota;
      },
      set: async () => {
        throw quota;
      },
      lpush: async () => {
        throw quota;
      },
      lrange: async () => {
        throw quota;
      },
    } satisfies RecordBackend);

    const created = await handleOvieMcpRequest({
      store: new FailoverOperatingStore({
        primary: failingPrimary,
        fallback: new MemoryOperatingStore(durable),
        isPrimaryFailure: () => true,
        writeThrough: true,
      }),
      principal: founder,
      body: rpc(
        'tools/call',
        {
          name: 'create_initiative',
          arguments: {
            title: 'Public Artist Profile Certification',
            intent: 'Map and certify launch-critical profile capabilities',
            desired_outcome: 'Launch-ready public profiles',
            why: 'Cannot ship uncertified profiles',
            provenance: 'chatgpt-mcp-dogfood',
            priority: 'engineering',
          },
        },
        'c-quota'
      ),
    });
    const createdBody = toolResult<{
      id: string;
      evidence: Array<{ summary: string }>;
      handoff: { desired_outcome?: string; why?: string; provenance?: string };
    }>(created.body);
    expect(createdBody.id).toMatch(/^ini_[A-Za-z0-9_-]{8,24}$/);
    expect(createdBody.evidence.length).toBeGreaterThan(0);

    const fetched = await handleOvieMcpRequest({
      store: new FailoverOperatingStore({
        primary: failingPrimary,
        fallback: new MemoryOperatingStore(durable),
        isPrimaryFailure: () => true,
      }),
      principal: founder,
      body: rpc(
        'tools/call',
        { name: 'get_initiative', arguments: { id: createdBody.id } },
        'g-quota'
      ),
    });
    const fetchedBody = toolResult<{
      id: string;
      evidence: Array<{ summary: string }>;
      receipts: Array<{ destination: string }>;
      handoff: { desired_outcome?: string; why?: string; provenance?: string };
    }>(fetched.body);
    expect(fetchedBody.id).toBe(createdBody.id);
    expect(fetchedBody.evidence).toEqual(createdBody.evidence);
    expect(fetchedBody.handoff.desired_outcome).toBe(
      'Launch-ready public profiles'
    );
    expect(fetchedBody.handoff.why).toBe('Cannot ship uncertified profiles');
    expect(fetchedBody.handoff.provenance).toBe('chatgpt-mcp-dogfood');
    expect(fetchedBody.receipts.length).toBeGreaterThan(0);
  });

  it('persists a decision that later work can reference', async () => {
    const store = new MemoryOperatingStore();
    const decision = toolResult<{ id: string }>(
      (
        await handleOvieMcpRequest({
          store,
          principal: founder,
          body: rpc('tools/call', {
            name: 'record_decision',
            arguments: {
              decided: 'Certify public artist profiles before launch',
              why: 'Cannot announce what is uncertified',
              provenance: 'strategy-chat',
            },
          }),
        })
      ).body
    );
    const initiative = toolResult<{ decisionId?: string }>(
      (
        await handleOvieMcpRequest({
          store,
          principal: founder,
          body: rpc('tools/call', {
            name: 'create_initiative',
            arguments: {
              title: 'Profile cert',
              intent: 'Execute the decision',
              decision_id: decision.id,
            },
          }),
        })
      ).body
    );
    expect(initiative.decisionId).toBe(decision.id);
  });

  it('lets authenticated non-founders read org state', async () => {
    const result = await handleOvieMcpRequest({
      principal: user,
      body: rpc('tools/call', {
        name: 'get_org_state',
        arguments: { query: 'what is blocked?' },
      }),
    });
    expect(result.status).toBe(200);
    expect(toolResult<{ identity: string }>(result.body).identity).toBe('ovie');
  });

  it('searches gbrain read-only through the Ovie pack', async () => {
    const result = await handleOvieMcpRequest({
      principal: founder,
      body: rpc('tools/call', {
        name: 'search_gbrain',
        arguments: { query: 'ovie mcp' },
      }),
    });
    expect(result.status).toBe(200);
    const body = toolResult<{
      write: boolean;
      hits: Array<{ slug: string }>;
    }>(result.body);
    expect(body.write).toBe(false);
    expect(body.hits[0]?.slug).toBe('ovie-mcp');
  });
});

describe('Ovie MCP OAuth', () => {
  it('registers ChatGPT redirects and completes PKCE across instances', () => {
    const registrar = getOvieOAuthIssuer('test-secret');
    const exchanger = getOvieOAuthIssuer('test-secret');
    const verifier = 'verifier-abcdefghijklmnopqrstuvwxyz0123456789';
    const redirectUri = 'https://chatgpt.com/connector/oauth/callback';
    const client = registrar.registerClient({ redirect_uris: [redirectUri] });
    const code = registrar.issueCode({
      clientId: client.client_id,
      redirectUri,
      codeChallenge: pkceS256(verifier),
      subject: 'tim',
      email: 'tim@meetjovie.com',
      isAdmin: true,
    });
    const token = exchanger.exchangeToken({
      clientId: client.client_id,
      redirectUri,
      code,
      codeVerifier: verifier,
    });
    const claims = exchanger.verifyAccessToken(token.access_token);
    expect(claims?.isAdmin).toBe(true);
    expect(claims?.email).toBe('tim@meetjovie.com');
    expect(isAllowedRedirect('https://evil.example/cb')).toBe(false);
  });

  it('sends ChatGPT OAuth to /signin, and resets a wrong-account session', () => {
    const next = '/api/ovie/oauth/authorize?response_type=code&client_id=x';
    expect(ovieFounderLoginLocation(next, false)).toBe(
      `/signin?redirect_url=${encodeURIComponent(next)}`
    );
    expect(ovieFounderLoginLocation(next, true)).toBe(
      `/api/auth/reset?redirect_url=${encodeURIComponent(next)}`
    );
    expect(ovieFounderLoginLocation(next, false)).not.toContain('/identity');
  });

  it('treats Better Auth DB admins as Ovie OAuth founders', () => {
    expect(
      isOvieOAuthFounder({
        authenticated: true,
        entitlementsAdmin: false,
        dbAdmin: true,
      })
    ).toBe(true);
    expect(
      isOvieOAuthFounder({
        authenticated: true,
        entitlementsAdmin: false,
        dbAdmin: false,
      })
    ).toBe(false);
  });

  it('refuses non-founder authorization codes', () => {
    const issuer = getOvieOAuthIssuer('test-secret-2');
    const client = issuer.registerClient({
      redirect_uris: ['http://localhost:3210/cb'],
    });
    expect(() =>
      issuer.issueCode({
        clientId: client.client_id,
        redirectUri: 'http://localhost:3210/cb',
        codeChallenge: 'abc',
        subject: 'fan',
        isAdmin: false,
      })
    ).toThrow(/founder/);
  });
});
