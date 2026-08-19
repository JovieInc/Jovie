import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { handleOvieMcpRequest } from '@/lib/ovie/mcp/handler';
import {
  MemoryOperatingStore,
  memoryRecordBackend,
} from '@/lib/ovie/mcp/store';

const founder = {
  authenticated: true,
  isAdmin: true,
  scopes: ['ovie:read', 'ovie:write'] as const,
};
const guest = { authenticated: false, isAdmin: false, scopes: [] as const };

function rpc(method: string, params?: unknown, id: string | number = '1') {
  return { jsonrpc: '2.0', id, method, params };
}

describe('Ovie MCP HTTP capture (shipped handler)', () => {
  it('initialize without auth, list, create, get with evidence', async () => {
    const noauth = await handleOvieMcpRequest({
      body: rpc('initialize', {}, 1),
      principal: guest,
    });
    expect(noauth.status).toBe(401);

    const backend = memoryRecordBackend();
    const list = await handleOvieMcpRequest({
      store: new MemoryOperatingStore(backend),
      principal: founder,
      body: rpc('tools/list', {}, 2),
    });
    expect(list.status).toBe(200);

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
            provenance: 'ovie-mcp-http-capture',
            priority: 'engineering',
          },
        },
        3
      ),
    });
    const createdBody = (
      created.body as {
        result: {
          structuredContent: {
            id: string;
            evidence: unknown[];
            handoff: { desired_outcome?: string };
          };
        };
      }
    ).result.structuredContent;
    expect(createdBody.id).toMatch(/^ini_[A-Za-z0-9_-]{8,24}$/);
    expect(createdBody.id.includes('.')).toBe(false);
    expect(createdBody.evidence.length).toBeGreaterThan(0);

    const fetched = await handleOvieMcpRequest({
      store: new MemoryOperatingStore(backend),
      principal: founder,
      body: rpc(
        'tools/call',
        { name: 'get_initiative', arguments: { id: createdBody.id } },
        4
      ),
    });
    const fetchedBody = (
      fetched.body as {
        result: {
          structuredContent: {
            id: string;
            evidence: unknown[];
            handoff: { desired_outcome?: string; provenance?: string };
          };
        };
      }
    ).result.structuredContent;
    expect(fetchedBody.id).toBe(createdBody.id);
    expect(fetchedBody.evidence).toEqual(createdBody.evidence);
    expect(fetchedBody.handoff.desired_outcome).toBe(
      'Launch-ready public profiles'
    );

    const dest = process.env.OVIE_MCP_CAPTURE;
    if (dest) {
      writeFileSync(
        dest,
        `${JSON.stringify(
          [
            {
              step: 'initialize_noauth',
              status: noauth.status,
              body: noauth.body,
              headers: noauth.headers,
            },
            { step: 'tools_list', status: list.status, body: list.body },
            {
              step: 'create_initiative',
              status: created.status,
              body: created.body,
            },
            {
              step: 'get_initiative',
              status: fetched.status,
              body: fetched.body,
            },
          ],
          null,
          2
        )}\n`
      );
    }
  });
});
