import { NextRequest } from 'next/server';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  buildDeliveryPayload,
  requireDeliveryAcknowledgement,
  requireOrderingCapability,
  SOURCE_ORDER_SCHEMA,
} from '../../../../../../../scripts/lib/component-certificate-delivery.mjs';

const state = vi.hoisted(() => ({ rows: new Map<string, unknown>() }));
vi.mock('@/lib/ovie/mcp/postgres-backend', () => ({
  postgresRecordBackend: () => ({
    get: async (key: string) => structuredClone(state.rows.get(key) ?? null),
    set: async (key: string, value: unknown) => {
      state.rows.set(key, structuredClone(value));
    },
    setIfAbsent: async (key: string, value: unknown) => {
      if (state.rows.has(key)) return false;
      state.rows.set(key, structuredClone(value));
      return true;
    },
    compareAndSet: async (key: string, before: unknown, next: unknown) => {
      if (JSON.stringify(state.rows.get(key)) !== JSON.stringify(before))
        return false;
      state.rows.set(key, structuredClone(next));
      return true;
    },
  }),
}));
vi.mock('@/lib/utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn() },
}));
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }));

import { OPTIONS, POST } from './route';

const path = 'https://jov.ie/api/internal/ovie/component-certificate-evidence';
beforeEach(() => {
  state.rows.clear();
  vi.stubEnv('CRON_SECRET', 'fixture-secret');
});
afterEach(() => {
  vi.unstubAllEnvs();
});
const packet = (ordinal: number, sha: string) =>
  buildDeliveryPayload(
    {
      headSha: sha.repeat(40),
      totals: { byCriterion: {}, certified: 0, components: 0 },
      certificates: [],
    },
    {
      deliveryOrder: {
        schema: SOURCE_ORDER_SCHEMA,
        sourceOrdinal: ordinal,
        runNumber: 5,
        runAttempt: 1,
      },
    }
  );
const post = (body: unknown) =>
  POST(
    new NextRequest(path, {
      method: 'POST',
      headers: { authorization: 'Bearer fixture-secret' },
      body: JSON.stringify(body),
    })
  );

it('runs real cron auth, validation and ordered persistence without an ingest mock', async () => {
  const capability = await OPTIONS(
    new NextRequest(path, {
      method: 'OPTIONS',
      headers: { authorization: 'Bearer fixture-secret' },
    })
  );
  expect(capability.status).toBe(200);
  requireOrderingCapability(await capability.json());
  expect(state.rows.size).toBe(0);
  const newer = packet(20, 'b');
  const accepted = await post(newer);
  expect(accepted.status).toBe(200);
  const acknowledgement = await accepted.json();
  requireDeliveryAcknowledgement(acknowledgement, newer);
  expect(acknowledgement).toMatchObject({
    accepted: true,
    reason: 'stored',
    storedHeadSha: newer.headSha,
    deliveryOrder: newer.deliveryOrder,
  });
  const older = await post(packet(10, 'a'));
  expect(older.status).toBe(409);
  await expect(older.json()).resolves.toMatchObject({
    accepted: false,
    reason: 'stale',
    storedHeadSha: newer.headSha,
  });
  const { deliveryOrder: _order, ...legacy } = packet(30, 'c');
  const unordered = await post(legacy);
  expect(unordered.status).toBe(409);
  await expect(unordered.json()).resolves.toMatchObject({
    accepted: false,
    reason: 'legacy-after-ordered',
    storedHeadSha: newer.headSha,
  });
  expect(
    state.rows.get('component-certificate:source-ordered-latest/v1')
  ).toEqual(newer);
  expect(state.rows.get('component-certificate:history')).toHaveLength(1);
});
