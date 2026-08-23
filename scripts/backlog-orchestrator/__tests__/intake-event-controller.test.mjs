import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import {
  buildIntakeEventReceipt,
  normalizeIntakeEvent,
  persistReceipt,
} from '../intake-event-controller.mjs';

function githubDispatchEvent(payload = {}) {
  return {
    action: 'linear-intake-changed',
    client_payload: {
      delivery_id: 'linear-delivery-abc',
      issue_id: 'issue_123',
      issue_identifier: 'JOV-5313',
      issue_updated_at: '2026-08-23T00:00:00.000Z',
      team_key: 'JOV',
      state_name: 'Todo',
      intake_action: 'update',
      plan_ready: false,
      ...payload,
    },
  };
}

describe('intake event controller', () => {
  it('carries Linear provider delivery identity as the durable event key', () => {
    const event = normalizeIntakeEvent(githubDispatchEvent());
    assert.equal(event.deliveryId, 'linear-delivery-abc');
    assert.equal(event.eventKey, 'linear-delivery-abc');
    assert.equal(event.issue, 'JOV-5313');
    assert.equal(event.action, 'update');
    const receipt = buildIntakeEventReceipt(event);
    assert.equal(receipt.disposition.status, 'enrichment-required');
    assert.equal(receipt.event.deliveryId, 'linear-delivery-abc');
  });

  it('holds Linear events that dropped provider delivery identity', () => {
    const event = normalizeIntakeEvent(
      githubDispatchEvent({ delivery_id: '' })
    );
    assert.equal(event.deliveryId, null);
    assert.notEqual(event.eventKey, 'linear-delivery-abc');
    assert.equal(
      buildIntakeEventReceipt(event).disposition.reason,
      'provider-delivery-identity-missing'
    );
  });

  it('makes duplicate provider delivery idempotent without a second receipt', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'jovie-intake-event-'));
    try {
      const receipt = buildIntakeEventReceipt(
        normalizeIntakeEvent(githubDispatchEvent())
      );
      const [first, duplicate] = await Promise.all([
        persistReceipt(receipt, { stateDir: directory }),
        persistReceipt(receipt, { stateDir: directory }),
      ]);
      assert.deepEqual(
        new Set([first.status, duplicate.status]),
        new Set(['created', 'duplicate'])
      );
      assert.equal(first.path, duplicate.path);
      assert.equal(first.receipt.event.deliveryId, 'linear-delivery-abc');
      assert.equal(duplicate.receipt.event.deliveryId, 'linear-delivery-abc');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
