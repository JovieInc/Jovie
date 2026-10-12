import assert from 'node:assert/strict';
import { it, vi } from 'vitest';
import {
  classifyAudienceEffect,
  denyAudienceEffect,
} from './audience-effect-policy';

const audienceOperations = [
  'audience.comment.reply',
  'audience.comment.publish',
  'audience.dm.send',
  'audience.email.send',
  'audience.sms.send',
  'audience.bulk.send',
  'audience.campaign.enroll',
  'audience.delivery.schedule',
  'audience.delivery.retry',
  'audience.provider-draft.publish',
];

it('every audience effect is terminally denied, across channels and producers', () => {
  for (const operation of audienceOperations) {
    const receipt = denyAudienceEffect(operation);
    assert.equal(receipt.decision, 'blocked', operation);
    assert.equal(receipt.dispatchAllowed, false, operation);
    assert.equal(receipt.retryable, false, operation);
    assert.equal(
      receipt.queueDisposition,
      'do_not_enqueue_or_retry',
      operation
    );
    assert.equal(receipt.reason, 'audience_delivery_disabled', operation);
  }
});

it('unknown IDs, aliases, inherited keys and malformed values fail closed', () => {
  for (const operation of [
    'constructor',
    '__proto__',
    'toString',
    'hasOwnProperty',
    '',
    'send_email',
    'audience.dm.send ',
    'AUDIENCE.DM.SEND',
    'audience.whatsapp.send',
    'account.marketing.send',
    null,
    undefined,
    true,
    0,
    NaN,
    Symbol('send'),
    [],
    {},
  ]) {
    const receipt = denyAudienceEffect(operation);
    assert.equal(receipt.effectClass, 'unknown');
    assert.equal(receipt.reason, 'unclassified_operation');
    assert.equal(receipt.dispatchAllowed, false);
  }
});

it('transactional account, security, compliance and owner surfaces stay distinct', () => {
  const cases = [
    ['account.password-reset.send', 'account_security'],
    ['account.otp.send', 'account_security'],
    ['account.billing-receipt.send', 'account_transactional'],
    ['compliance.sms-stop-ack.send', 'mandatory_compliance'],
    ['compliance.sms-help.send', 'mandatory_compliance'],
    ['owner.slack.notify', 'owner_control'],
    ['owner.imessage.notify', 'owner_control'],
  ];
  for (const [operation, effectClass] of cases) {
    assert.equal(classifyAudienceEffect(operation), effectClass);
    const receipt = denyAudienceEffect(operation);
    assert.equal(receipt.reason, 'separate_authority_required');
    assert.equal(receipt.dispatchAllowed, false);
  }
});

it('local drafting and triage classify without gaining an external dispatch grant', () => {
  for (const operation of [
    'local.draft.write',
    'local.conversation.resolve',
    'local.conversation.snooze',
    'local.person.note',
  ]) {
    assert.equal(classifyAudienceEffect(operation), 'local_only');
    const receipt = denyAudienceEffect(operation);
    assert.equal(receipt.reason, 'local_operation_not_dispatchable');
    assert.equal(receipt.dispatchAllowed, false);
  }
});

it('model grants, consent, full scopes, flags and purported human approvals cannot override', () => {
  const attempts = [
    { actor: 'model', granted: true },
    { actor: 'human', approvalId: 'synthetic-one-use', approved: true },
    { consent: 'marketing-opt-in', scopes: ['send', 'admin'] },
    { automaticSending: true, bypass: true, dryRun: false },
    { purpose: 'password-reset', effectClass: 'account_security' },
  ];
  for (const claims of attempts) {
    // JSON-shaped requests are not canonical server operation IDs.
    const request = { operation: 'audience.dm.send', ...claims };
    assert.equal(denyAudienceEffect(request).dispatchAllowed, false);
    // Even a wrapper extracting the correct ID cannot gain a grant.
    assert.equal(denyAudienceEffect(request.operation).dispatchAllowed, false);
  }
});

it('scheduled delivery, replay, retry, bulk and channel/recipient/content changes remain denied', () => {
  const scenarios = [
    { operation: 'audience.delivery.schedule', when: 'tomorrow' },
    { operation: 'audience.delivery.retry', attempt: 6 },
    { operation: 'audience.bulk.send', recipientCount: 500 },
    { operation: 'audience.email.send', recipient: 'changed@example.invalid' },
    { operation: 'audience.sms.send', content: 'edited after approval' },
    {
      operation: 'audience.dm.send',
      approvedChannel: 'email',
      channel: 'instagram',
    },
    { operation: 'audience.provider-draft.publish', approvalExpired: true },
  ];
  for (const scenario of scenarios) {
    const first = denyAudienceEffect(scenario.operation);
    for (let replay = 0; replay < 3; replay++) {
      assert.deepEqual(denyAudienceEffect(scenario.operation), first);
      assert.equal(first.dispatchAllowed, false);
      assert.equal(first.retryable, false);
    }
  }
});

it('untrusted objects are never coerced or inspected, including throwing proxies', () => {
  let calls = 0;
  const malicious = {
    get operation() {
      calls++;
      throw new Error('getter executed');
    },
    toString() {
      calls++;
      throw new Error('coercion executed');
    },
  };
  const proxy = new Proxy(
    {},
    {
      get() {
        throw new Error('proxy read');
      },
      getOwnPropertyDescriptor() {
        throw new Error('proxy descriptor read');
      },
    }
  );
  assert.equal(denyAudienceEffect(malicious).dispatchAllowed, false);
  assert.equal(denyAudienceEffect(proxy).dispatchAllowed, false);
  assert.equal(calls, 0);
});

it('receipt is immutable and excludes identities, content, tokens and arbitrary operation text', () => {
  const privateInput =
    'synthetic-secret recipient@example.invalid private-note';
  const receipt = denyAudienceEffect(privateInput);
  assert.equal(JSON.stringify(receipt).includes(privateInput), false);
  assert.ok(Object.isFrozen(receipt));
  assert.equal(Reflect.set(receipt, 'dispatchAllowed', true), false);
  assert.equal(receipt.dispatchAllowed, false);
});

it('evaluation cannot perform fetch or obtain a provider client from caller input', async () => {
  let networkCalls = 0;
  let clientReads = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    networkCalls++;
    throw new Error('egress forbidden');
  };
  try {
    // A fresh module instance also loads under the trap, without initializers.
    vi.resetModules();
    const isolated = await import('./audience-effect-policy');
    const input = {
      operation: 'audience.dm.send',
      get providerClient() {
        clientReads++;
        throw new Error('client accessed');
      },
    };
    isolated.denyAudienceEffect(input);
    for (const operation of audienceOperations)
      isolated.denyAudienceEffect(operation);
    isolated.denyAudienceEffect('new.unregistered.operation');
    isolated.denyAudienceEffect('local.draft.write');
    isolated.denyAudienceEffect('owner.slack.notify');
    assert.equal(networkCalls, 0);
    assert.equal(clientReads, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
