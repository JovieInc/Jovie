import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import {
  buildIntakeEventReceipt,
  normalizeIntakeEvent,
  persistReceipt,
} from './intake-event-controller.mjs';

describe('durable intake event controller', () => {
  it('deduplicates the same durable webhook delivery', async () => {
    const stateDir = await mkdtemp(join(tmpdir(), 'jovie-intake-event-'));
    try {
      const event = normalizeIntakeEvent({
        delivery_id: 'linear-delivery-123',
        client_payload: {
          source: 'linear',
          issue_identifier: 'JOV-5306',
          team_key: 'JOV',
          state_name: 'Todo',
        },
      });
      const receipt = buildIntakeEventReceipt(event, {
        now: '2026-08-22T12:00:00.000Z',
      });
      const [first, duplicate] = await Promise.all([
        persistReceipt(receipt, { stateDir }),
        persistReceipt(receipt, { stateDir }),
      ]);
      assert.deepEqual(
        new Set([first.status, duplicate.status]),
        new Set(['created', 'duplicate'])
      );
      assert.equal(first.path, duplicate.path);
      assert.equal(duplicate.receipt.event.eventKey, 'linear-delivery-123');
    } finally {
      await rm(stateDir, { recursive: true, force: true });
    }
  });
});
