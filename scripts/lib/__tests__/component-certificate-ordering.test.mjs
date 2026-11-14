import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildDeliveryPayload,
  requireDeliveryAcknowledgement,
  requireOrderingCapability,
  SOURCE_ORDER_SCHEMA,
} from '../component-certificate-delivery.mjs';

const order = {
  schema: SOURCE_ORDER_SCHEMA,
  sourceOrdinal: 15,
  runNumber: 20,
  runAttempt: 2,
};
const report = {
  headSha: 'a'.repeat(40),
  totals: { byCriterion: {}, certified: 0, components: 0 },
  certificates: [],
};
const payload = buildDeliveryPayload(report, { deliveryOrder: order });
const ack = {
  ok: true,
  accepted: true,
  reason: 'stored',
  storedHeadSha: report.headSha,
  deliveryOrder: order,
};

describe('ordered delivery protocol', () => {
  it('retains legacy builder compatibility and includes explicit validated ordering', () => {
    expect(buildDeliveryPayload(report)).not.toHaveProperty('deliveryOrder');
    expect(payload.deliveryOrder).toEqual(order);
  });
  it.each([
    null,
    {},
    { ...order, extra: 1 },
    { ...order, sourceOrdinal: 0 },
    { ...order, runNumber: '20' },
    { ...order, runAttempt: Number.MAX_SAFE_INTEGER + 1 },
  ])('refuses invalid ordering: %j', deliveryOrder => {
    expect(() => buildDeliveryPayload(report, { deliveryOrder })).toThrow(
      'invalid delivery order'
    );
  });
  it('requires an explicit receiver capability and exact generation acknowledgement', () => {
    expect(() =>
      requireOrderingCapability({
        ok: true,
        deliveryOrderSchema: SOURCE_ORDER_SCHEMA,
      })
    ).not.toThrow();
    expect(() => requireDeliveryAcknowledgement(ack, payload)).not.toThrow();
    expect(() =>
      requireDeliveryAcknowledgement({ ...ack, reason: 'duplicate' }, payload)
    ).not.toThrow();
  });
  it.each([
    null,
    {},
    { ok: true },
    { ok: true, deliveryOrderSchema: 'unsupported' },
    { ok: false, deliveryOrderSchema: SOURCE_ORDER_SCHEMA },
  ])('refuses legacy or unavailable capability: %j', response => {
    expect(() => requireOrderingCapability(response)).toThrow();
  });
  it.each([
    {},
    { ...ack, accepted: false },
    { ...ack, ok: false },
    { ...ack, reason: 'stale' },
    { ...ack, storedHeadSha: 'b'.repeat(40) },
    { ...ack, deliveryOrder: { ...order, runAttempt: 1 } },
    { ...ack, deliveryOrder: { ...order, sourceOrdinal: 14 } },
    { ...ack, deliveryOrder: { ...order, extra: 1 } },
  ])(
    'refuses a 2xx-shaped response without the exact stored generation: %j',
    response => {
      expect(() => requireDeliveryAcknowledgement(response, payload)).toThrow();
    }
  );
  it('the CLI refuses missing workflow metadata and writes only a valid ordered packet', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ordered-packet-'));
    try {
      const input = join(dir, 'report.json'),
        output = join(dir, 'payload.json');
      writeFileSync(input, JSON.stringify(report));
      const entry = resolve(
        import.meta.dirname,
        '../component-certificate-delivery.mjs'
      );
      const run = (values, sourceSha = report.headSha) =>
        spawnSync(
          process.execPath,
          [
            entry,
            input,
            '--out',
            output,
            '--source-ordinal',
            '15',
            '--source-sha',
            sourceSha,
          ],
          {
            encoding: 'utf8',
            env: {
              ...process.env,
              GITHUB_RUN_NUMBER: '',
              GITHUB_RUN_ATTEMPT: '',
              ...values,
            },
          }
        );
      expect(run({}).status).not.toBe(0);
      expect(
        run({ GITHUB_RUN_NUMBER: '20', GITHUB_RUN_ATTEMPT: '2' }).status
      ).toBe(0);
      expect(JSON.parse(readFileSync(output, 'utf8')).deliveryOrder).toEqual(
        order
      );
      for (const sourceSha of ['', 'b'.repeat(40)])
        expect(
          run({ GITHUB_RUN_NUMBER: '20', GITHUB_RUN_ATTEMPT: '2' }, sourceSha)
            .status
        ).not.toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
