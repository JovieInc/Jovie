import { randomUUID } from 'node:crypto';
import {
  actionResultSchema,
  FLEET_SCOPES,
  type FleetActionId,
  getActionDescriptor,
} from '@jovie/action-contracts';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { completedFleetResult } from '@/lib/ovie/mcp/postgres-canary.test-utils';
import { type FleetControlOperation, FleetDispatcher } from './dispatcher';
import { handleFleetInvocation } from './http';

// Explicit, opt-in, disposable loopback database only; never a production URL.
const url = process.env.FLEET_LOCAL_DB_URL;
const clients: { end: () => Promise<void> }[] = [];
vi.mock('@/lib/db', async () => {
  if (!url) return { db: undefined };
  const parsed = new URL(url);
  if (
    !['localhost', '127.0.0.1'].includes(parsed.hostname) ||
    parsed.pathname !== '/jov7331_canary'
  )
    throw new Error('Disposable local canary database required');
  const [{ drizzle }, { default: postgres }, { ovieOperatingKv }] =
    await Promise.all([
      import('drizzle-orm/postgres-js'),
      import('postgres'),
      import('@/lib/db/schema/ovie'),
    ]);
  const client = postgres(url, { max: 4 });
  clients.push(client);
  await client`CREATE TABLE IF NOT EXISTS ovie_operating_kv (key text PRIMARY KEY,value jsonb NOT NULL,updated_at timestamptz NOT NULL DEFAULT now())`;
  return { db: drizzle(client, { schema: { ovieOperatingKv } }) };
});
afterAll(async () => {
  for (const client of clients) await client.end();
});
describe.skipIf(!url)(
  'actual Postgres backend and canonical adapters local canary',
  () => {
    it('persists an attested two-worker request, exact approval and requester receipt across restarts', async () => {
      const { postgresRecordBackend } = await import(
        '@/lib/ovie/mcp/postgres-backend'
      );
      const profileId = randomUUID();
      const backend = postgresRecordBackend();
      const dispatcher = new FleetDispatcher({ backend, enabled: true });
      const control = async (op: FleetControlOperation, input: unknown) =>
        dispatcher.control(
          profileId,
          'test-founder',
          await dispatcher.approve(profileId, 'test-founder', op, input),
          op,
          input
        );
      const provision = async (workerId: string) => {
        const result = await control('provision', {
          workerId,
          scopes: FLEET_SCOPES,
          expiresAt: new Date(Date.now() + 3600000).toISOString(),
          authority: {
            identity: {
              provider: 'local-canary',
              accountRef: `urn:fixture:account:${workerId}`,
              runtimeRef: `urn:fixture:runtime:${workerId}`,
              displayName: 'Synthetic canary worker',
              role: 'operator',
              attestationRef: 'urn:fixture:approval',
            },
            visibility: 'operators',
            allowedCommands: ['api.openapi'],
            allowedTools: ['jovie'],
            allowedConnectors: [],
            maxDurationSeconds: 60,
            maxConcurrentLeases: 1,
            spendUsd: 0,
          },
        });
        return result.token as string;
      };
      const requester = await provision('requester');
      const helper = await provision('helper');
      const invoke = async (
        d: FleetDispatcher,
        id: FleetActionId,
        input: unknown,
        token: string,
        idempotencyKey = randomUUID()
      ) => {
        const result = await d.invoke(
          id,
          {
            schemaVersion: 1,
            idempotencyKey,
            context: { profileId, channel: 'cli' },
            input,
          },
          token
        );
        return completedFleetResult(result, id);
      };
      for (const [workerId, token] of [
        ['requester', requester],
        ['helper', helper],
      ]) {
        await invoke(
          dispatcher,
          'fleet.register',
          {
            workerId,
            runtimeClass: 'node24',
            capabilities: ['api.openapi'],
            tools: ['jovie'],
            connectors: [],
            availability: 'available',
          },
          token
        );
      }
      expect(
        (await invoke(dispatcher, 'fleet.directory', {}, requester)).workers
      ).toHaveLength(2);
      const requestId = randomUUID();
      const proposal = {
        requestId,
        kind: 'dogfood',
        proposal: {
          issueId: 'JOV-7393',
          title: 'Read real public OpenAPI',
          acceptanceCriteria: ['Return a valid public contract receipt'],
          existingWorkRefs: ['https://jov.ie/api/v1/openapi.json'],
          command: 'api.openapi',
          requiredTools: ['jovie'],
          requiredConnectors: [],
          targetWorkerId: 'helper',
          maxDurationSeconds: 60,
          notAfter: new Date(Date.now() + 600000).toISOString(),
        },
      };
      const requests = await Promise.all([
        invoke(dispatcher, 'work.request', proposal, requester),
        invoke(dispatcher, 'work.request', proposal, requester),
      ]);
      expect(requests[0].request).toEqual(requests[1].request);
      expect(
        (await invoke(dispatcher, 'work.next', {}, helper)).lease
      ).toBeNull();
      await control('accept', {
        requestId,
        owner: 'test-founder',
        founderIntentRef: 'urn:fixture:accept',
      });
      const restarted = new FleetDispatcher({
        backend: postgresRecordBackend(),
        enabled: true,
      });
      const { lease } = (await invoke(restarted, 'work.next', {}, helper)) as {
        lease: { leaseId: string };
      };
      await invoke(restarted, 'work.claim', { leaseId: lease.leaseId }, helper);
      const response = await fetch('https://jov.ie/api/v1/openapi.json', {
        signal: AbortSignal.timeout(30000),
      });
      expect(response.ok).toBe(true);
      const contract = await response.json();
      expect(contract.openapi).toMatch(/^3\./);
      const report = await invoke(
        restarted,
        'work.report',
        {
          leaseId: lease.leaseId,
          outcome: 'completed',
          summary: 'Synthetic helper read a real public contract',
          evidence: [
            {
              ref: 'https://jov.ie/api/v1/openapi.json',
              summary: `HTTP ${response.status}; OpenAPI ${contract.openapi}`,
            },
          ],
        },
        helper
      );
      const readback = new FleetDispatcher({
        backend: postgresRecordBackend(),
        enabled: true,
      });
      const status = await invoke(readback, 'fleet.status', {}, requester);
      expect(status.requests).toMatchObject([
        { requestId, state: 'completed', receipt: report.receipt },
      ]);
      expect((await readback.inspect(profileId)).requests).toHaveLength(1);
      const persisted = JSON.stringify(
        await backend.get(`ovie:mcp:v1:fleet:${profileId}`)
      );
      expect(persisted).not.toContain(requester);
      expect(persisted).not.toContain(helper);
    }, 60000);
    it('registers, leases, reads real OpenAPI, records durable evidence, replays through REST and proves revocation', async () => {
      const { postgresRecordBackend } = await import(
        '@/lib/ovie/mcp/postgres-backend'
      );
      const profileId = randomUUID(),
        backend = postgresRecordBackend();
      const dispatcher = new FleetDispatcher({ backend, enabled: true });
      const control = async (
        op: 'provision' | 'assign' | 'revoke',
        input: unknown
      ) =>
        dispatcher.control(
          profileId,
          'test-founder',
          await dispatcher.approve(profileId, 'test-founder', op, input),
          op,
          input
        );
      const credential = await control('provision', {
        workerId: 'aeon',
        scopes: FLEET_SCOPES,
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
      });
      const token = credential.token as string;
      const envelope = (
        input: unknown,
        key = randomUUID(),
        channel = 'cli'
      ) => ({
        schemaVersion: 1,
        idempotencyKey: key,
        context: { profileId, channel, clientVersion: 'local-canary' },
        input,
      });
      const registration = {
        workerId: 'aeon',
        runtimeClass: 'node24',
        capabilities: ['api.openapi'],
        tools: ['jovie'],
        connectors: [],
        availability: 'available',
      };
      const invoke = async (id: any, input: unknown) => {
        const result = await dispatcher.invoke(id, envelope(input), token);
        expect(result.status).toBe('completed');
        expect(
          actionResultSchema(getActionDescriptor(id).outputSchema).safeParse(
            result
          ).success
        ).toBe(true);
        return (result as any).data;
      };
      await invoke('fleet.register', registration);
      const missionId = randomUUID();
      await control('assign', {
        missionId,
        issueId: 'JOV-7331',
        title: 'Read real public OpenAPI',
        acceptanceCriteria: ['Real public API returns a valid OpenAPI payload'],
        owner: 'test-founder',
        existingWorkRefs: [],
        command: 'api.openapi',
        requiredTools: ['jovie'],
        requiredConnectors: [],
        maxDurationSeconds: 60,
        notAfter: new Date(Date.now() + 600000).toISOString(),
        founderIntentRef: 'urn:local:test-approval',
      });
      const offers = await Promise.all([
        invoke('work.next', {}),
        invoke('work.next', {}),
      ]);
      expect(offers[0].lease.leaseId).toBe(offers[1].lease.leaseId);
      expect((await dispatcher.inspect(profileId)).leases).toHaveLength(1);
      const { lease } = offers[0];
      const claims = await Promise.all([
        invoke('work.claim', { leaseId: lease.leaseId }),
        invoke('work.claim', { leaseId: lease.leaseId }),
      ]);
      expect(claims[0].lease.expiresAt).toBe(claims[1].lease.expiresAt);
      // Public API read stays real. No enrichment fixture or production identity.
      const response = await fetch('https://jov.ie/api/v1/openapi.json', {
        signal: AbortSignal.timeout(30000),
      });
      expect(response.ok).toBe(true);
      const contract = await response.json();
      expect(contract.openapi).toMatch(/^3\./);
      const key = randomUUID();
      const report = {
        leaseId: lease.leaseId,
        outcome: 'completed',
        summary: 'Public OpenAPI returned a valid payload',
        evidence: [
          {
            ref: 'https://jov.ie/api/v1/openapi.json',
            summary: `HTTP ${response.status}; OpenAPI ${contract.openapi}`,
          },
        ],
      };
      const results = await Promise.all([
        dispatcher.invoke('work.report', envelope(report, key), token),
        dispatcher.invoke('work.report', envelope(report, key), token),
      ]);
      const direct = results[0];
      expect(direct.status).toBe('completed');
      expect(results[1]).toEqual(direct);
      const deps = { dispatcher, founder: async () => null };
      const fetchImpl = async (input: string | URL, init?: RequestInit) =>
        handleFleetInvocation(new Request(input, init), 'work.report', deps);
      const replay = await fetchImpl(
        'https://local.test/api/v1/actions/work.report/invoke',
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: JSON.stringify(envelope(report, key)),
        }
      );
      expect(replay.status).toBe(200);
      expect(await replay.json()).toEqual(direct);
      // New dispatcher uses persisted DB state, proving restart durability.
      const restarted = new FleetDispatcher({
        backend: postgresRecordBackend(),
        enabled: true,
      });
      expect((await restarted.inspect(profileId)).receipts).toHaveLength(1);
      await control('revoke', { workerId: 'aeon' });
      expect(
        await restarted.invoke('work.report', envelope(report, key), token)
      ).toMatchObject({ error: { code: 'AUTH_REQUIRED' } });
      expect(
        JSON.stringify(await backend.get(`ovie:mcp:v1:fleet:${profileId}`))
      ).not.toContain(token);
    }, 60000);
  }
);
