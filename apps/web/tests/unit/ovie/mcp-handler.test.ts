import { afterEach, describe, expect, it, vi } from 'vitest';

const workflowCaptureMocks = vi.hoisted(() => ({
  create: vi.fn(),
  get: vi.fn(),
}));

const founderWorkMocks = vi.hoisted(() => ({
  listLinearIssues: vi.fn(async () => [
    {
      id: 'linear-1',
      identifier: 'JOV-5223',
      title: 'Ovie provider work',
      url: 'https://linear.app/jovie/issue/JOV-5223',
    },
  ]),
  listGithubPullRequests: vi.fn(async () => [
    {
      number: 16209,
      title: 'Source PR',
      url: 'https://github.com/JovieInc/Jovie/pull/16209',
    },
  ]),
  getGithubPullRequest: vi.fn(async () => ({
    number: 16209,
    title: 'Source PR',
    url: 'https://github.com/JovieInc/Jovie/pull/16209',
    body: 'source',
  })),
  listGithubIssues: vi.fn(async () => [
    {
      number: 5223,
      title: 'Ovie MCP providers',
      url: 'https://github.com/JovieInc/Jovie/issues/5223',
    },
  ]),
  getGithubIssue: vi.fn(async () => ({
    number: 5223,
    title: 'Ovie MCP providers',
    url: 'https://github.com/JovieInc/Jovie/issues/5223',
    body: 'issue',
  })),
}));

const linearCoordinationMocks = vi.hoisted(() => ({
  createIssue: vi.fn(async (input: { title: string }) => ({
    id: 'linear-created',
    identifier: 'JOV-9000',
    title: input.title,
    url: 'https://linear.app/jovie/issue/JOV-9000',
  })),
  updateIssue: vi.fn(),
  readIssue: vi.fn(async () => ({
    id: 'linear-created',
    identifier: 'JOV-9000',
    title: 'Created through Ovie',
    url: 'https://linear.app/jovie/issue/JOV-9000',
  })),
}));

vi.mock('@/lib/wiki/gbrain-client', () => ({
  putPage: vi.fn(async () => ({ ok: true as const })),
  searchPages: vi.fn(async (query: string) => [
    { slug: 'ovie-mcp', title: `hit:${query}`, score: 0.9 },
  ]),
  getPage: vi.fn(async (slug: string) =>
    slug === 'ovie-mcp'
      ? { slug, title: 'Ovie MCP', compiled_truth: 'read-only' }
      : null
  ),
}));

vi.mock('@/lib/workflow-capture/server', () => ({
  createWorkflowCaptureRequest: workflowCaptureMocks.create,
  getWorkflowCaptureReceipt: workflowCaptureMocks.get,
}));

vi.mock('@/lib/ovie/mcp/founder-work', async importOriginal => {
  const original =
    await importOriginal<typeof import('@/lib/ovie/mcp/founder-work')>();
  return {
    ...original,
    createLiveFounderWorkReader: () => founderWorkMocks,
  };
});

vi.mock('@/lib/ovie/linear-coordination-live', () => ({
  createLiveLinearCoordinationDeps: () => linearCoordinationMocks,
}));

import {
  bindEveIdentityForTurn,
  eveIdentityForMcpDoor,
} from '@/lib/ovie/identity';
import {
  DEST_KANBAN,
  DEST_LINEAR,
  OVIE_LINEAR_QUEUED_ACK,
  OVIE_QUEUED_ACK,
} from '@/lib/ovie/ingest';
import { handleOvieMcpRequest } from '@/lib/ovie/mcp/handler';
import {
  getOvieOAuthIssuer,
  isAllowedRedirect,
  isOvieOAuthFounder,
  issueOvieLanderAccessToken,
  OVIE_OAUTH_SCOPES,
  ovieFounderLoginLocation,
  pkceS256,
} from '@/lib/ovie/mcp/oauth';
import * as operatingStore from '@/lib/ovie/mcp/store';
import {
  DurableOperatingStore,
  FailoverOperatingStore,
  MemoryOperatingStore,
  memoryRecordBackend,
  type RecordBackend,
} from '@/lib/ovie/mcp/store';
import {
  authorizeOvieMcpTool,
  callOvieMcpTool,
  isOvieFounderTool,
  isOvieWriteTool,
} from '@/lib/ovie/mcp/tools';
import {
  OVIE_MCP_TOOLS,
  type OvieInitiative,
  type OvieMcpPrincipal,
} from '@/lib/ovie/mcp/types';
import { getPage, putPage, searchPages } from '@/lib/wiki/gbrain-client';

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

function legacyEngineeringInitiative(id: string): OvieInitiative {
  const now = new Date().toISOString();
  return {
    id,
    kind: 'initiative',
    status: 'proposed',
    confidence: 'medium',
    handoff: {
      title: 'Legacy signup bug',
      intent: 'Fix a production signup bug',
      priority: 'engineering',
    },
    lane: 'engineering',
    destination: DEST_KANBAN,
    receipts: [
      {
        text: 'legacy signup bug',
        lane: 'engineering',
        destination: DEST_KANBAN,
        ack: OVIE_QUEUED_ACK,
        destinationHandle: null,
        workerSpawned: false,
        workId: id,
        idempotencyKey: `ovie-dump:v1:${id}`,
      },
    ],
    workerSpawned: false,
    destinationHandle: null,
    idempotencyKey: `ovie-dump:v1:${id}`,
    createdAt: now,
    updatedAt: now,
    evidence: [
      {
        kind: 'receipt',
        summary: OVIE_QUEUED_ACK,
        ref: DEST_KANBAN,
      },
    ],
  };
}

describe('Ovie MCP handler', () => {
  it('rejects a body that does not name a method', async () => {
    const result = await handleOvieMcpRequest({
      body: { jsonrpc: '2.0', id: 7 },
      principal: founder,
    });
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({
      jsonrpc: '2.0',
      id: null,
      error: { code: -32700, message: 'Parse error' },
    });
  });

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
    expect(eveIdentityForMcpDoor().id).toBe('summer');
    expect(eveIdentityForMcpDoor().role).toBe('company-operator');
    expect(bindEveIdentityForTurn('summer').pack.id).toBe('summer');
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

  it('records and verifies a bounded approval without conferring authority', async () => {
    const store = new MemoryOperatingStore();
    const digest = `sha256:${'1'.padStart(64, '0')}`;
    const recorded = await handleOvieMcpRequest({
      store,
      principal: founder,
      body: rpc('tools/call', {
        name: 'record_bounded_approval',
        arguments: {
          actor: 'founder_1',
          action: 'merge',
          repository: 'JovieInc/Jovie',
          revision: 'a'.repeat(40),
          diff_digest: digest,
        },
      }),
    });
    expect(recorded.status).toBe(200);
    const approval = toolResult<{
      id: string;
      actor: string;
      action: string;
      executed: boolean;
      authority_conferred: boolean;
      identities: Record<string, boolean>;
    }>(recorded.body);
    expect(approval.executed).toBe(false);
    expect(approval.authority_conferred).toBe(false);
    expect(approval.identities.executionCompleted).toBe(false);

    const verified = await handleOvieMcpRequest({
      store,
      principal: founder,
      body: rpc('tools/call', {
        name: 'get_bounded_approval',
        arguments: {
          id: approval.id,
          actor: 'founder_1',
          action: 'merge',
          repository: 'JovieInc/Jovie',
          revision: 'a'.repeat(40),
          diff_digest: digest,
        },
      }),
    });
    expect(verified.status).toBe(200);
    expect(
      toolResult<{
        verified: { valid: boolean; reason: string | null };
      }>(verified.body).verified
    ).toMatchObject({ valid: true, reason: null });

    const stale = await handleOvieMcpRequest({
      store,
      principal: founder,
      body: rpc('tools/call', {
        name: 'get_bounded_approval',
        arguments: {
          id: approval.id,
          actor: 'founder_1',
          action: 'merge',
          repository: 'JovieInc/Jovie',
          revision: 'b'.repeat(40),
        },
      }),
    });
    expect(
      toolResult<{
        verified: { valid: boolean; reason: string };
      }>(stale.body).verified
    ).toMatchObject({ valid: false, reason: 'revision-mismatch' });
  });

  it('rejects non-founder bounded-approval writes', async () => {
    const result = await handleOvieMcpRequest({
      body: rpc('tools/call', {
        name: 'record_bounded_approval',
        arguments: {
          actor: 'founder_1',
          action: 'merge',
          repository: 'JovieInc/Jovie',
          revision: 'a'.repeat(40),
          diff_digest: `sha256:${'1'.padStart(64, '0')}`,
        },
      }),
      principal: user,
    });
    expect(result.status).toBe(403);
  });

  it('founder-gates Linear and GitHub provider work', async () => {
    for (const name of ['list_linear_issues', 'list_github_issues']) {
      const result = await handleOvieMcpRequest({
        body: rpc('tools/call', { name, arguments: {} }),
        principal: user,
      });
      expect(result.status).toBe(403);
    }

    const create = await handleOvieMcpRequest({
      body: rpc('tools/call', {
        name: 'create_linear_issue',
        arguments: {
          title: 'Created through Ovie',
          description: 'Founder-authorized work',
          founder_intent_ref: 'chatgpt:founder-request',
          source_refs: ['JOV-5223'],
          author: 'tim',
        },
      }),
      principal: user,
    });
    expect(create.status).toBe(403);
    expect(linearCoordinationMocks.createIssue).not.toHaveBeenCalled();
  });

  it('lets an OAuth founder list/create Linear work and list/read Jovie GitHub work', async () => {
    const calls = [
      { name: 'list_linear_issues', arguments: { limit: 5 } },
      {
        name: 'create_linear_issue',
        arguments: {
          title: 'Created through Ovie',
          description: 'Founder-authorized work',
          founder_intent_ref: 'chatgpt:founder-request',
          source_refs: ['JOV-5223'],
          author: 'tim',
        },
      },
      {
        name: 'list_github_pull_requests',
        arguments: { state: 'open', limit: 5 },
      },
      { name: 'get_github_pull_request', arguments: { number: 16209 } },
      {
        name: 'list_github_issues',
        arguments: { state: 'all', limit: 5 },
      },
      { name: 'get_github_issue', arguments: { number: 5223 } },
    ] as const;

    const results = [];
    for (const params of calls) {
      const response = await handleOvieMcpRequest({
        body: rpc('tools/call', params),
        principal: founder,
      });
      expect(response.status).toBe(200);
      results.push(toolResult<Record<string, unknown>>(response.body));
    }

    expect(results[0]).toMatchObject({
      provider: 'linear',
      team: 'JOV',
      trust: 'untrusted_external_data',
      issues: [{ identifier: 'JOV-5223' }],
    });
    expect(results[1]).toMatchObject({
      status: 'ok',
      provider: 'linear',
      team: 'JOV',
      identities: {
        linearAccepted: true,
        executionCompleted: false,
        deliveryAccepted: false,
      },
    });
    expect(results[2]).toMatchObject({
      repository: 'JovieInc/Jovie',
      pull_requests: [{ number: 16209 }],
    });
    expect(results[3]).toMatchObject({
      repository: 'JovieInc/Jovie',
      pull_request: { number: 16209, body: 'source' },
    });
    expect(results[4]).toMatchObject({
      repository: 'JovieInc/Jovie',
      issues: [{ number: 5223 }],
    });
    expect(results[5]).toMatchObject({
      repository: 'JovieInc/Jovie',
      issue: { number: 5223, body: 'issue' },
    });
    expect(founderWorkMocks.listLinearIssues).toHaveBeenCalledWith(5);
    expect(linearCoordinationMocks.createIssue).toHaveBeenCalledWith({
      title: 'Created through Ovie',
      description: 'Founder-authorized work',
      teamId: 'bdc09edc-f91c-4a06-b308-74b4fcf093f8',
    });
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
      confidence: string;
      workerSpawned: boolean;
      destinationHandle: string | null;
      ack: string;
      queuedFor?: string;
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
    expect(createdBody.confidence).toBe('medium');
    expect(createdBody.workerSpawned).toBe(false);
    expect(createdBody.destinationHandle).toBeNull();
    expect(createdBody.ack).toBe('stored and queued for Summer Linear intake');
    expect(createdBody.queuedFor).toBe('summer-linear-intake');
    expect(createdBody.receipts[0]?.destination).toBe('linear');
    expect(createdBody.evidence[0]?.summary).toBe(
      'stored and queued for Summer Linear intake'
    );
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

  it('normalizes legacy engineering records during direct initiative reads', async () => {
    const store = new MemoryOperatingStore();
    await store.putInitiative(legacyEngineeringInitiative('ini_legacy_mcp'));

    const fetched = await handleOvieMcpRequest({
      store,
      principal: founder,
      body: rpc(
        'tools/call',
        { name: 'get_initiative', arguments: { id: 'ini_legacy_mcp' } },
        'g-legacy'
      ),
    });

    expect(fetched.status).toBe(200);
    const fetchedBody = toolResult<{
      destination: string;
      status: string;
      ack: string;
      queuedFor?: string;
      receipts: Array<{ destination: string; ack: string }>;
      evidence: Array<{ ref?: string; summary: string }>;
    }>(fetched.body);
    expect(fetchedBody.destination).toBe(DEST_LINEAR);
    expect(fetchedBody.status).toBe('proposed');
    expect(fetchedBody.ack).toBe(OVIE_LINEAR_QUEUED_ACK);
    expect(fetchedBody.queuedFor).toBe('summer-linear-intake');
    expect(fetchedBody.receipts[0]?.destination).toBe(DEST_LINEAR);
    expect(fetchedBody.evidence[0]).toMatchObject({
      ref: DEST_LINEAR,
      summary: OVIE_LINEAR_QUEUED_ACK,
    });

    const stored = await store.getInitiative('ini_legacy_mcp');
    expect(stored?.status).toBe('proposed');
    expect(stored?.destination).toBe(DEST_LINEAR);
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
      setIfAbsent: async () => {
        throw quota;
      },
      compareAndSet: async () => {
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

  it('persists initiative confidence and rejects unknown values', async () => {
    const store = new MemoryOperatingStore();
    const created = toolResult<{
      confidence: string;
      workerSpawned: boolean;
    }>(
      (
        await handleOvieMcpRequest({
          store,
          principal: founder,
          body: rpc('tools/call', {
            name: 'create_initiative',
            arguments: {
              title: 'Certify public artist profiles',
              intent: 'Launch-ready /tim',
              confidence: 'high',
              open_questions: ['What is the discography truth set?'],
            },
          }),
        })
      ).body
    );
    expect(created.confidence).toBe('high');
    expect(created.workerSpawned).toBe(false);

    const state = toolResult<{
      active_initiatives: Array<{ confidence: string }>;
      session_handoff: { open_questions: string[] };
    }>(
      (
        await handleOvieMcpRequest({
          store,
          principal: founder,
          body: rpc('tools/call', {
            name: 'get_org_state',
            arguments: { query: 'session handoff' },
          }),
        })
      ).body
    );
    expect(state.active_initiatives[0]?.confidence).toBe('high');
    expect(state.session_handoff.open_questions).toContain(
      'What is the discography truth set?'
    );

    const rejected = await handleOvieMcpRequest({
      store,
      principal: founder,
      body: rpc('tools/call', {
        name: 'create_initiative',
        arguments: {
          title: 'Bad confidence',
          intent: 'Should fail',
          confidence: 'pretty-sure',
        },
      }),
    });
    expect(rejected.status).toBe(200);
    expect(rejected.body).toMatchObject({
      error: { message: 'confidence must be high, medium, or low' },
    });
  });

  it('puts a recording request in the founder Inbox and returns it to the requesting task', async () => {
    const principal = {
      ...founder,
      subject: 'c67f31fc-4b61-43de-b690-b9d8045de8e0',
    };
    workflowCaptureMocks.create.mockResolvedValue({
      schemaVersion: 1,
      captureId: 'capture-123',
      requestingTaskId: 'task-youtube-playback',
      state: 'pending',
      expiresAt: '2026-09-04T18:00:00.000Z',
      sha256: null,
      byteSize: null,
      durationMs: null,
      uploadedAt: null,
      readyAt: null,
      revokedAt: null,
    });

    const created = await handleOvieMcpRequest({
      principal,
      body: rpc('tools/call', {
        name: 'request_workflow_capture',
        arguments: {
          requesting_task_id: 'task-youtube-playback',
          request_key: 'studio-native-experiment-v1',
          title: 'Record a YouTube Studio thumbnail experiment',
          instructions: 'Open one eligible video and start the native test.',
          start_url: 'https://studio.youtube.com/',
        },
      }),
    });

    expect(created.status).toBe(200);
    expect(workflowCaptureMocks.create).toHaveBeenCalledWith({
      userId: principal.subject,
      request: expect.objectContaining({
        requestingTaskId: 'task-youtube-playback',
        requestedBy: 'jovie_agent',
      }),
    });
    expect(
      toolResult<{
        requestingTaskId: string;
        delivery: string;
        recordButton: boolean;
        pollWith: string;
      }>(created.body)
    ).toMatchObject({
      requestingTaskId: 'task-youtube-playback',
      delivery: 'ovie_inbox',
      recordButton: true,
      pollWith: 'get_workflow_capture',
    });

    workflowCaptureMocks.get.mockResolvedValue({
      schemaVersion: 1,
      captureId: 'capture-123',
      requestingTaskId: 'task-youtube-playback',
      state: 'ready',
      expiresAt: '2026-09-04T18:00:00.000Z',
      sha256: 'a'.repeat(64),
      byteSize: 1200,
      durationMs: 6000,
      uploadedAt: '2026-08-28T18:00:00.000Z',
      readyAt: '2026-08-28T18:01:00.000Z',
      revokedAt: null,
    });
    const fetched = await handleOvieMcpRequest({
      principal,
      body: rpc('tools/call', {
        name: 'get_workflow_capture',
        arguments: { capture_id: 'capture-123' },
      }),
    });
    expect(
      toolResult<{ state: string; mediaPath: string; recordButton: boolean }>(
        fetched.body
      )
    ).toMatchObject({
      state: 'ready',
      mediaPath: '/api/workflow-captures/capture-123/media',
      recordButton: false,
    });
  });

  it('lets authorized founders read org state', async () => {
    const result = await handleOvieMcpRequest({
      principal: founder,
      body: rpc('tools/call', {
        name: 'get_org_state',
        arguments: { query: 'what is blocked?' },
      }),
    });
    expect(result.status).toBe(200);
    const body = toolResult<{
      identity: string;
      uncertified_launch_critical: Array<{ id: string }>;
      session_handoff: { decisions: string[]; initiatives: unknown[] };
    }>(result.body);
    expect(body.identity).toBe('summer');
    expect(body.uncertified_launch_critical.length).toBeGreaterThan(0);
    expect(body.session_handoff).toMatchObject({
      decisions: expect.any(Array),
      initiatives: expect.any(Array),
    });
  });

  it('returns a four-pass certification spec without executing money paths', async () => {
    const result = await handleOvieMcpRequest({
      principal: founder,
      body: rpc('tools/call', {
        name: 'certify_feature',
        arguments: { feature: 'auto-sync-from-spotify' },
      }),
    });
    const body = toolResult<{
      executed_live_mission: boolean;
      money_path_executed: boolean;
      spec: string;
      passes: Array<{ n: number; name: string }>;
    }>(result.body);
    expect(body.executed_live_mission).toBe(false);
    expect(body.money_path_executed).toBe(false);
    expect(body.spec).toMatch(/canonical artist identity/i);
    expect(body.passes.map(pass => pass.name)).toEqual([
      'author',
      'adversary',
      'execute',
      'backfill',
    ]);
  });

  it('projects invariant exceptions to Ovie for the founder without dumping healthy detail', async () => {
    const denied = await handleOvieMcpRequest({
      principal: user,
      body: rpc('tools/call', {
        name: 'get_invariant_stewardship',
        arguments: {},
      }),
    });
    expect(denied.status).toBe(403);

    const result = await handleOvieMcpRequest({
      principal: founder,
      body: rpc('tools/call', {
        name: 'get_invariant_stewardship',
        arguments: {},
      }),
    });
    expect(result.status).toBe(200);
    const body = toolResult<{
      summary: { candidates: number; actionableExceptions: number };
      summerQueue: Array<{ kind: string; owner: string }>;
      founderQueue: unknown[];
      candidates?: unknown[];
      drillDown: string;
    }>(result.body);
    expect(body.summary.candidates).toBeGreaterThan(10);
    expect(body.summary.actionableExceptions).toBe(body.summerQueue.length);
    expect(body.summerQueue.every(item => item.kind !== 'approved')).toBe(true);
    expect(body.founderQueue).toEqual([]);
    expect(body.candidates).toBeUndefined();
    expect(body.drillDown).toContain('invariant-stewardship.current-week.json');
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

  it('prepares the latest certified investor proof brief for the founder', async () => {
    const result = await handleOvieMcpRequest({
      principal: founder,
      body: rpc('tools/call', {
        name: 'get_proof_brief',
        arguments: {},
      }),
    });
    expect(result.status).toBe(200);
    const body = toolResult<{
      schema: string;
      found: boolean;
      audience: string;
      briefId: string;
      revision: number;
      window: { label: string };
      text: string;
      imageUrl: string | null;
      card: { schema: string; facts: Array<{ label: string; value: string }> };
      sent: boolean;
    }>(result.body);
    expect(body.schema).toBe('summer.proof-brief.v1');
    expect(body.found).toBe(true);
    expect(body.audience).toBe('investor');
    expect(body.briefId).toBe('pb_2026-09-29_jovie_investor');
    expect(body.text).toContain('last 7 days');
    expect(body.imageUrl).toContain(
      `/api/share/proof-brief?brief=${body.briefId}&rev=${body.revision}`
    );
    expect(body.card.schema).toBe('summer.ops-card.v1');
    expect(body.card.facts.some(f => f.label === 'Share image')).toBe(true);
    expect(body.sent).toBe(false);
  });

  it('scopes get_proof_brief to the founder', async () => {
    const result = await handleOvieMcpRequest({
      principal: user,
      body: rpc('tools/call', {
        name: 'get_proof_brief',
        arguments: {},
      }),
    });
    expect(result.status).toBe(403);
  });

  it('reports found:false for an unknown pinned brief', async () => {
    const result = await handleOvieMcpRequest({
      principal: founder,
      body: rpc('tools/call', {
        name: 'get_proof_brief',
        arguments: { brief_id: 'pb_missing' },
      }),
    });
    expect(result.status).toBe(200);
    const body = toolResult<{ found: boolean }>(result.body);
    expect(body.found).toBe(false);
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
    expect(claims?.scopes).toEqual([...OVIE_OAUTH_SCOPES]);
    expect(token.scope).toBe(OVIE_OAUTH_SCOPES.join(' '));
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

describe('private Ovie MCP authorization boundary', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const deniedPrincipals: Array<[string, OvieMcpPrincipal, number]> = [
    ['unauthenticated', guest, 401],
    [
      'ordinary creator cookie',
      { ...user, subject: 'creator-own', scopes: [] },
      403,
    ],
    [
      'another creator with copied Ovie scopes',
      { ...user, subject: 'creator-other', scopes: founder.scopes },
      403,
    ],
    ['admin without scopes', { ...founder, scopes: [] }, 403],
    [
      'admin with absent scope claim',
      { ...founder, scopes: undefined as unknown as string[] },
      403,
    ],
    [
      'admin with a string scope claim',
      { ...founder, scopes: 'ovie:read' as unknown as string[] },
      403,
    ],
    [
      'admin with cross-product scopes',
      { ...founder, scopes: ['jovie:read', 'jovie:write'] },
      403,
    ],
    [
      'admin with write-only scope',
      { ...founder, scopes: ['ovie:write'] },
      403,
    ],
    [
      'truthy non-boolean admin claim',
      { ...founder, isAdmin: 'true' as unknown as boolean },
      403,
    ],
  ];

  it.each(deniedPrincipals)(
    'denies %s before every private tool or provider access',
    async (_label, principal, status) => {
      vi.clearAllMocks();
      const access = vi.fn(() => {
        throw new Error('synthetic-private-store-payload');
      });
      const store = new Proxy(new MemoryOperatingStore(), { get: access });
      const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
      const warnLog = vi.spyOn(console, 'warn').mockImplementation(() => {});
      for (const name of OVIE_MCP_TOOLS) {
        expect(authorizeOvieMcpTool(principal, name)).toMatchObject({
          ok: false,
          status,
        });
        const direct = await callOvieMcpTool(store, principal, name, {
          id: 'synthetic-private-id',
          query: 'synthetic-private-query',
        });
        expect(direct).toMatchObject({ ok: false, status });
        const response = await handleOvieMcpRequest({
          store,
          principal,
          body: rpc('tools/call', {
            name,
            arguments: {
              id: 'synthetic-private-id',
              query: 'synthetic-private-query',
            },
          }),
        });
        expect(response.status).toBe(status);
        expect(response.body).toMatchObject({ error: { code: -32001 } });
        expect(JSON.stringify(response.body)).not.toContain(
          'synthetic-private'
        );
      }
      expect(access).not.toHaveBeenCalled();
      for (const provider of [
        getPage,
        searchPages,
        workflowCaptureMocks.create,
        workflowCaptureMocks.get,
        ...Object.values(founderWorkMocks),
        ...Object.values(linearCoordinationMocks),
      ]) {
        expect(provider).not.toHaveBeenCalled();
      }
      expect(errorLog).not.toHaveBeenCalled();
      expect(warnLog).not.toHaveBeenCalled();
    }
  );

  it.each(deniedPrincipals)(
    'denies %s discovery before constructing a default store',
    async (_label, principal, status) => {
      const defaultStore = vi.spyOn(operatingStore, 'getDefaultOperatingStore');
      for (const method of [
        'initialize',
        'tools/list',
        'notifications/initialized',
      ]) {
        const response = await handleOvieMcpRequest({
          principal,
          body: rpc(method),
        });
        expect(response.status).toBe(status);
        expect(response.body).toMatchObject({ error: { code: -32001 } });
        expect(JSON.stringify(response.body)).not.toContain('get_org_state');
        if (status === 401)
          expect(response.headers?.['www-authenticate']).toContain(
            'resource_metadata'
          );
      }
      expect(defaultStore).not.toHaveBeenCalled();
    }
  );

  it('classifies and authorizes the complete registered private inventory', () => {
    for (const name of OVIE_MCP_TOOLS) {
      expect(isOvieWriteTool(name) || isOvieFounderTool(name)).toBe(true);
      expect(authorizeOvieMcpTool(founder, name)).toEqual({ ok: true });
      const readOnly = authorizeOvieMcpTool(
        { ...founder, scopes: ['ovie:read'] },
        name
      );
      expect(readOnly).toEqual(
        isOvieWriteTool(name)
          ? { ok: false, status: 403, message: 'operating scope required' }
          : { ok: true }
      );
    }
  });

  it('preserves founder browser and existing service access, including read-only discovery', async () => {
    const issuer = getOvieOAuthIssuer('synthetic-ovie-test-secret');
    const pair = issueOvieLanderAccessToken({
      subject: 'service:synthetic-operator',
      secret: 'synthetic-ovie-test-secret',
    });
    const claims = issuer.verifyAccessToken(pair.access_token);
    expect(claims).not.toBeNull();
    for (const principal of [
      founder,
      { ...founder, subject: 'browser-founder', scopes: ['ovie:read'] },
      {
        authenticated: true,
        isAdmin: claims?.isAdmin === true,
        subject: claims?.sub,
        scopes: claims?.scopes ?? [],
      },
    ]) {
      const store = new MemoryOperatingStore();
      const discovery = await handleOvieMcpRequest({
        principal,
        store,
        body: rpc('tools/list'),
      });
      expect(discovery.status).toBe(200);
      expect(
        (
          discovery.body as { result: { tools: Array<{ name: string }> } }
        ).result.tools.map(tool => tool.name)
      ).toEqual([...OVIE_MCP_TOOLS]);
      const read = await handleOvieMcpRequest({
        principal,
        store,
        body: rpc('tools/call', { name: 'get_org_state' }),
      });
      expect(read.status).toBe(200);
      expect(toolResult<{ identity: string }>(read.body).identity).toBe(
        'summer'
      );
    }
  });

  it('denies read-only founder writes before store access', async () => {
    const access = vi.fn(() => {
      throw new Error('synthetic-private-store-payload');
    });
    const store = new Proxy(new MemoryOperatingStore(), { get: access });
    for (const name of OVIE_MCP_TOOLS.filter(isOvieWriteTool)) {
      const response = await handleOvieMcpRequest({
        principal: { ...founder, scopes: ['ovie:read'] },
        store,
        body: rpc('tools/call', {
          name,
          arguments: { decided: 'synthetic-private-decision' },
        }),
      });
      expect(response.status).toBe(403);
      expect(response.body).toMatchObject({
        error: { code: -32001, message: 'operating scope required' },
      });
    }
    expect(access).not.toHaveBeenCalled();
  });

  it.each([
    '',
    'new_private_tool',
    '__proto__',
    'constructor',
    'synthetic-private-unknown-name',
  ])(
    'fails closed for unknown capability %s, even for a founder',
    async name => {
      expect(authorizeOvieMcpTool(founder, name)).toEqual({
        ok: false,
        status: 403,
        message: 'unknown operating capability',
      });
      const result = await handleOvieMcpRequest({
        principal: founder,
        store: new MemoryOperatingStore(),
        body: rpc('tools/call', { name }),
      });
      expect(result.status).toBe(403);
      expect(result.body).toMatchObject({
        error: { message: 'unknown operating capability' },
      });
    }
  );

  it('projects legacy routing without persisting through a read-only principal', async () => {
    const store = new MemoryOperatingStore();
    const original = legacyEngineeringInitiative('ini_read_only_legacy');
    await store.putInitiative(original);
    const write = vi.spyOn(store, 'putInitiative');
    const response = await handleOvieMcpRequest({
      principal: { ...founder, scopes: ['ovie:read'] },
      store,
      body: rpc('tools/call', {
        name: 'get_initiative',
        arguments: { id: original.id },
      }),
    });
    expect(toolResult<{ destination: string }>(response.body).destination).toBe(
      DEST_LINEAR
    );
    expect(write).not.toHaveBeenCalled();
    expect(await store.getInitiative(original.id)).toEqual(original);
  });

  it('contains buffered operational memory provider failures', async () => {
    vi.mocked(putPage).mockResolvedValueOnce({
      ok: false,
      reason: 'synthetic-private-provider-payload',
    });
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    const warnLog = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const response = await handleOvieMcpRequest({
      principal: founder,
      store: new MemoryOperatingStore(),
      body: rpc('tools/call', {
        name: 'record_operational_memory',
        arguments: {
          slug: 'ops/summer/synthetic-regression',
          title: 'Provider failure',
          body: 'Synthetic regression evidence',
          kind: 'observed',
          source_refs: ['test:regression'],
          observed_at: '2026-10-06T18:00:00.000Z',
          author: 'test',
        },
      }),
    });
    expect(
      toolResult<{ status: string; reason: string }>(response.body)
    ).toMatchObject({
      status: 'buffered',
      reason: 'operational memory provider unavailable',
    });
    expect(
      JSON.stringify([response.body, errorLog.mock.calls, warnLog.mock.calls])
    ).not.toContain('synthetic-private');
  });

  it.each(['coordinate_linear_work', 'create_linear_issue'])(
    'contains soft provider failures from %s',
    async name => {
      linearCoordinationMocks.createIssue.mockRejectedValueOnce(
        new Error('synthetic-private-provider-payload')
      );
      const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
      const warnLog = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const response = await handleOvieMcpRequest({
        principal: founder,
        store: new MemoryOperatingStore(),
        body: rpc('tools/call', {
          name,
          arguments: {
            action: 'create',
            title: 'Provider failure',
            body: 'Synthetic regression evidence',
            description: 'Synthetic regression evidence',
            team_id: 'synthetic-team',
            founder_intent_ref: 'test:request',
            source_refs: ['test:regression'],
            author: 'test',
          },
        }),
      });
      expect(
        toolResult<{ status: string; message: string }>(response.body)
      ).toMatchObject({
        status: 'failed',
        message: 'Linear coordination unavailable',
      });
      expect(
        JSON.stringify([response.body, errorLog.mock.calls, warnLog.mock.calls])
      ).not.toContain('synthetic-private');
    }
  );

  it('does not return or log a private provider error payload', async () => {
    vi.mocked(getPage).mockRejectedValueOnce(
      new Error('synthetic-private-provider-payload')
    );
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    const warnLog = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const response = await handleOvieMcpRequest({
      principal: founder,
      store: new MemoryOperatingStore(),
      body: rpc('tools/call', {
        name: 'get_gbrain_page',
        arguments: { slug: 'synthetic-private-page' },
      }),
    });
    expect(response.body).toMatchObject({
      error: { code: -32603, message: 'internal error' },
    });
    expect(
      JSON.stringify([response.body, errorLog.mock.calls, warnLog.mock.calls])
    ).not.toContain('synthetic-private');
  });

  it.each([
    {
      name: 'get_proof_brief',
      args: { audience: 'synthetic-private-audience' },
      message:
        'audience must be investor, customer, manager, founder, or internal',
    },
    {
      name: 'record_operational_memory',
      args: { kind: 'synthetic-private-kind' },
      message:
        'kind must be observed, inference, proposal, or approved-decision',
    },
    {
      name: 'get_bounded_approval',
      args: {
        id: 'synthetic-private-approval',
        actor: 'synthetic-private-actor',
      },
      message:
        'verification requires action and repository together with actor',
    },
  ])(
    'returns a safe client validation error for $name after authorization',
    async ({ name, args, message }) => {
      const store = new MemoryOperatingStore();
      const getDecision = vi.spyOn(store, 'getDecision');
      const putDecision = vi.spyOn(store, 'putDecision');
      const writeMemory = vi.mocked(putPage);
      const previousWrites = writeMemory.mock.calls.length;
      const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
      const warnLog = vi.spyOn(console, 'warn').mockImplementation(() => {});

      for (const [principal, status] of [
        [guest, 401],
        [user, 403],
      ] as const) {
        const denied = await handleOvieMcpRequest({
          principal,
          store,
          body: rpc('tools/call', { name, arguments: args }),
        });
        expect(denied.status).toBe(status);
        expect(denied.body).toMatchObject({ error: { code: -32001 } });
      }

      const response = await handleOvieMcpRequest({
        principal: founder,
        store,
        body: rpc('tools/call', { name, arguments: args }),
      });
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        error: { code: -32602, message },
      });
      expect(getDecision).not.toHaveBeenCalled();
      expect(putDecision).not.toHaveBeenCalled();
      expect(writeMemory.mock.calls.length).toBe(previousWrites);
      expect(
        JSON.stringify([response.body, errorLog.mock.calls, warnLog.mock.calls])
      ).not.toContain('synthetic-private');
    }
  );

  it('contains default-store construction errors without exposing their payload', async () => {
    vi.spyOn(operatingStore, 'getDefaultOperatingStore').mockImplementationOnce(
      () => {
        throw new Error('synthetic-private-default-store-payload');
      }
    );
    const response = await handleOvieMcpRequest({
      principal: founder,
      body: rpc('tools/call', { name: 'get_org_state' }),
    });
    expect(response.body).toMatchObject({
      error: { code: -32603, message: 'internal error' },
    });
    expect(JSON.stringify(response.body)).not.toContain('synthetic-private');
  });

  it('does not reflect unknown method names in errors', async () => {
    const response = await handleOvieMcpRequest({
      principal: founder,
      store: new MemoryOperatingStore(),
      body: rpc('synthetic-private-method'),
    });
    expect(response.body).toMatchObject({
      error: { code: -32601, message: 'Method not found' },
    });
  });
});
