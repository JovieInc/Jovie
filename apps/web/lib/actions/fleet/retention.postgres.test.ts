import { randomUUID } from 'node:crypto';
import { FLEET_SCOPES, type FleetActionId } from '@jovie/action-contracts';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { completedFleetResult as completed } from '@/lib/ovie/mcp/postgres-canary.test-utils';
import type { FleetControlOperation, FleetState } from './dispatcher';

const url = process.env.FLEET_LOCAL_DB_URL;
const clients: { end: () => Promise<void> }[] = [];
vi.mock('@/lib/db', async () => {
  const { setupLocalPostgresCanary } = await import(
    '@/lib/ovie/mcp/postgres-canary.test-utils'
  );
  return setupLocalPostgresCanary(url, clients);
});
afterAll(async () => {
  await Promise.all(clients.map(client => client.end()));
});

describe.skipIf(!url)('actual Postgres fleet dispatcher retention', () => {
  it('compacts full dispatcher state, preserves replay and scoped history after restart, and rejects a rotated token', async () => {
    const [
      { FleetDispatcher },
      { fleetArchiveKey },
      { postgresRecordBackend },
    ] = await Promise.all([
      import('@/lib/actions/fleet/dispatcher'),
      import('@/lib/actions/fleet/retention'),
      import('@/lib/ovie/mcp/postgres-backend'),
    ]);
    const profileId = randomUUID();
    const key = `ovie:mcp:v1:fleet:${profileId}`;
    const now = Date.now();
    const backend = postgresRecordBackend();
    const restart = () =>
      new FleetDispatcher({
        backend: postgresRecordBackend(),
        enabled: true,
        now: () => now,
      });
    let dispatcher = restart();
    const control = async (operation: FleetControlOperation, input: unknown) =>
      dispatcher.control(
        profileId,
        'synthetic-founder',
        await dispatcher.approve(
          profileId,
          'synthetic-founder',
          operation,
          input
        ),
        operation,
        input
      );
    const credential = (workerId: string) => ({
      workerId,
      scopes: FLEET_SCOPES,
      expiresAt: new Date(now + 3600000).toISOString(),
    });
    const registration = (workerId: string, availability = 'available') => ({
      workerId,
      runtimeClass: 'synthetic-postgres-canary',
      capabilities: ['api.openapi'],
      tools: [],
      connectors: [],
      availability,
    });
    const invoke = (
      id: FleetActionId,
      input: unknown,
      token: string,
      idempotencyKey = randomUUID()
    ) =>
      dispatcher.invoke(
        id,
        {
          schemaVersion: 1,
          context: { profileId, channel: 'cli' },
          input,
          idempotencyKey,
        },
        token
      );
    const workerId = 'archive-worker';
    const token = String(
      (await control('provision', credential(workerId))).token
    );
    const registrationKey = randomUUID();
    const original = await invoke(
      'fleet.register',
      registration(workerId),
      token,
      registrationKey
    );
    completed(original);
    const outsiderId = 'archive-outsider';
    const outsider = String(
      (await control('provision', credential(outsiderId))).token
    );
    completed(
      await invoke('fleet.register', registration(outsiderId), outsider)
    );
    await control('assign', {
      missionId: randomUUID(),
      issueId: 'JOV-7393',
      title: 'Synthetic database-only archive canary',
      acceptanceCriteria: ['Persist a synthetic completion receipt'],
      owner: 'Synthetic founder',
      founderIntentRef: 'urn:fixture:archive-canary',
      existingWorkRefs: [],
      command: 'api.openapi',
      requiredTools: [],
      requiredConnectors: [],
      targetWorkerId: workerId,
      maxDurationSeconds: 60,
      notAfter: new Date(now + 600000).toISOString(),
    });
    const { lease } = completed(await invoke('work.next', {}, token)) as {
      lease: { leaseId: string };
    };
    completed(await invoke('work.claim', { leaseId: lease.leaseId }, token));
    const report = completed(
      await invoke(
        'work.report',
        {
          leaseId: lease.leaseId,
          outcome: 'completed',
          summary: 'Synthetic database-only completion; no external API called',
          evidence: [
            { ref: 'urn:fixture:archive-canary', summary: 'Synthetic receipt' },
          ],
        },
        token
      )
    );
    const seeded = (await backend.get(key)) as FleetState;
    const invocationId = Object.entries(seeded.invocations).find(
      ([, record]) => record.result?.receipt.requestId === registrationKey
    )?.[0];
    if (!invocationId) throw new Error('Registration invocation must exist');
    const initialCount = Object.keys(seeded.invocations).length;
    for (let index = initialCount; index < 4000; index++) {
      // Longer keys keep real digest IDs first in PostgreSQL jsonb object order.
      seeded.invocations[`synthetic-${String(index).padStart(70, '0')}`] =
        structuredClone(seeded.invocations[invocationId]);
    }
    expect(Object.keys(seeded.invocations)).toHaveLength(4000);
    await backend.set(key, seeded);
    dispatcher = restart();
    expect(
      await invoke(
        'fleet.register',
        registration(workerId),
        token,
        registrationKey
      )
    ).toEqual(original);
    const compacted = (await backend.get(key)) as FleetState;
    expect(Object.keys(compacted.invocations).length).toBeLessThan(4000);
    expect(compacted.invocations[invocationId]).toBeUndefined();
    expect(
      await backend.get(fleetArchiveKey(profileId, 'invocations', invocationId))
    ).toMatchObject({ value: { result: original } });
    const status = completed(await invoke('fleet.status', {}, token));
    expect(status.history).toMatchObject({
      entries: [{ kind: 'receipt', receipt: report.receipt }],
      nextCursor: null,
    });
    expect(
      completed(await invoke('fleet.status', {}, outsider)).history
    ).toMatchObject({
      entries: [],
      nextCursor: null,
    });
    dispatcher = restart();
    expect(
      await invoke(
        'fleet.register',
        registration(workerId),
        token,
        registrationKey
      )
    ).toEqual(original);
    expect(
      await invoke(
        'fleet.register',
        registration(workerId, 'busy'),
        token,
        registrationKey
      )
    ).toMatchObject({ error: { code: 'CONFLICT' } });
    const renewed = String(
      (await control('rotate', credential(workerId))).token
    );
    dispatcher = restart();
    expect(
      await invoke(
        'fleet.register',
        registration(workerId),
        token,
        registrationKey
      )
    ).toMatchObject({ error: { code: 'AUTH_REQUIRED' } });
    expect(
      completed(
        await invoke(
          'fleet.register',
          registration(workerId, 'busy'),
          renewed,
          registrationKey
        )
      ).worker
    ).toMatchObject({ availability: 'busy' });
    expect(
      completed(await invoke('fleet.status', {}, renewed)).history
    ).toMatchObject({
      entries: [{ kind: 'receipt', receipt: report.receipt }],
    });
  });
});
