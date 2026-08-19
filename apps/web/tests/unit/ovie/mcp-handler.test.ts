import { describe, expect, it } from 'vitest';
import {
  bindEveIdentityForTurn,
  eveIdentityForMcpDoor,
} from '@/lib/ovie/identity';
import { handleOvieMcpRequest } from '@/lib/ovie/mcp/handler';
import {
  challengeOf,
  getOvieOAuthIssuer,
  isAllowedRedirect,
} from '@/lib/ovie/mcp/oauth';
import { MemoryOperatingStore } from '@/lib/ovie/mcp/store';
import { OVIE_MCP_TOOLS } from '@/lib/ovie/mcp/types';

const founder = {
  authenticated: true,
  isAdmin: true,
  scopes: ['ovie:read', 'ovie:write'] as const,
};

const guest = {
  authenticated: false,
  isAdmin: false,
  scopes: [] as const,
};

const user = {
  authenticated: true,
  isAdmin: false,
  scopes: ['ovie:read'] as const,
};

function rpc(method: string, params?: unknown, id: string | number = 'req-1') {
  return { jsonrpc: '2.0', id, method, params };
}

describe('Ovie MCP handler', () => {
  it('rejects unauthenticated initialize', () => {
    const result = handleOvieMcpRequest({
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

  it('echoes JSON-RPC id and lists the six Ovie tools', () => {
    const result = handleOvieMcpRequest({
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

  it('rejects non-founder writes', () => {
    const result = handleOvieMcpRequest({
      body: rpc('tools/call', {
        name: 'create_initiative',
        arguments: { title: 'x', intent: 'y' },
      }),
      principal: user,
    });
    expect(result.status).toBe(403);
  });

  it('round-trips create_initiative then get_initiative without spawning', () => {
    const store = new MemoryOperatingStore();
    const created = handleOvieMcpRequest({
      store,
      principal: founder,
      body: rpc(
        'tools/call',
        {
          name: 'create_initiative',
          arguments: {
            title: 'Public Artist Profile Certification',
            intent: 'Map and certify launch-critical profile capabilities',
            desired_outcome: 'Launch-ready public profiles',
            provenance: 'chatgpt-mcp-dogfood',
          },
        },
        'c1'
      ),
    });
    expect(created.status).toBe(200);
    const createdBody = created.body as {
      id: string;
      result: {
        structuredContent: {
          id: string;
          workerSpawned: boolean;
          status: string;
        };
      };
    };
    expect(createdBody.id).toBe('c1');
    expect(createdBody.result.structuredContent.workerSpawned).toBe(false);
    const id = createdBody.result.structuredContent.id;
    expect(id.startsWith('ini_')).toBe(true);

    const fetched = handleOvieMcpRequest({
      store,
      principal: founder,
      body: rpc(
        'tools/call',
        { name: 'get_initiative', arguments: { id } },
        'g1'
      ),
    });
    const fetchedBody = fetched.body as {
      result: {
        structuredContent: {
          id: string;
          complete: boolean;
          merged_is_not_complete: boolean;
        };
      };
    };
    expect(fetchedBody.result.structuredContent.id).toBe(id);
    expect(fetchedBody.result.structuredContent.complete).toBe(false);
    expect(fetchedBody.result.structuredContent.merged_is_not_complete).toBe(
      true
    );
  });

  it('persists a decision that later work can reference', () => {
    const store = new MemoryOperatingStore();
    const decided = handleOvieMcpRequest({
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
    });
    const decision = (
      decided.body as { result: { structuredContent: { id: string } } }
    ).result.structuredContent;
    const created = handleOvieMcpRequest({
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
    });
    const initiative = (
      created.body as { result: { structuredContent: { decisionId?: string } } }
    ).result.structuredContent;
    expect(initiative.decisionId).toBe(decision.id);
  });

  it('lets authenticated non-founders read org state', () => {
    const result = handleOvieMcpRequest({
      principal: user,
      body: rpc('tools/call', {
        name: 'get_org_state',
        arguments: { query: 'what is blocked?' },
      }),
    });
    expect(result.status).toBe(200);
    const body = result.body as {
      result: { structuredContent: { identity: string } };
    };
    expect(body.result.structuredContent.identity).toBe('ovie');
  });
});

describe('Ovie MCP OAuth', () => {
  it('registers ChatGPT redirects and completes PKCE', () => {
    const issuer = getOvieOAuthIssuer('test-secret');
    const verifier = 'verifier-abcdefghijklmnopqrstuvwxyz0123456789';
    const client = issuer.registerClient({
      redirect_uris: ['https://chatgpt.com/connector/oauth/callback'],
    });
    const code = issuer.issueCode({
      clientId: client.client_id,
      redirectUri: 'https://chatgpt.com/connector/oauth/callback',
      codeChallenge: challengeOf(verifier),
      subject: 'tim',
      email: 'tim@meetjovie.com',
      isAdmin: true,
    });
    const token = issuer.exchangeToken({
      clientId: client.client_id,
      redirectUri: 'https://chatgpt.com/connector/oauth/callback',
      code,
      codeVerifier: verifier,
    });
    const claims = issuer.verifyAccessToken(token.access_token);
    expect(claims?.isAdmin).toBe(true);
    expect(claims?.email).toBe('tim@meetjovie.com');
    expect(isAllowedRedirect('https://evil.example/cb')).toBe(false);
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
