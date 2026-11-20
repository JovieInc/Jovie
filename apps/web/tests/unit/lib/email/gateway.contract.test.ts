/**
 * Send gateway contract (docs/company/email-sending-streams.md). Every rule
 * in the stream registry has a case here; the gateway runs with fakes, so
 * nothing touches a database, Redis or Resend.
 */
import { describe, expect, it, vi } from 'vitest';
import { type GatewayDeps, runGateway } from '@/lib/email/gateway/core';
import type { StreamEmailRequest } from '@/lib/email/gateway/policy';
import type { EmailTransport } from '@/lib/email/gateway/resend-transport';
import {
  EMAIL_STREAM_REGISTRY,
  EMAIL_STREAMS,
  findHardViolations,
  isCoreDomain,
  streamPolicy,
} from '@/lib/email/streams';

const ADDRESS = '1 Example Street, Suite 2, Los Angeles, CA 90001';
const UNSUB = {
  'List-Unsubscribe': '<https://jov.ie/api/unsubscribe?token=t>',
  'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
};

function makeDeps(overrides: Partial<GatewayDeps> = {}) {
  const send = vi.fn<EmailTransport['send']>(async () => ({
    ok: true as const,
    messageId: 'msg_1',
  }));
  const violations: string[] = [];
  const deps: GatewayDeps = {
    env: {},
    mailingAddress: ADDRESS,
    entityName: 'Jovie Technology Inc.',
    transport: { name: 'resend', configured: () => true, send },
    testRecipientBlock: () => null,
    readPause: async () => null,
    cardStatus: async () => 'approved',
    suppression: async () => ({ suppressed: false }),
    rateLimited: async () => false,
    record: () => {},
    onViolation: error => violations.push(error.message),
    ...overrides,
  };
  return { deps, send, violations };
}

const base = {
  to: 'person@example.com',
  subject: 'Subject',
  text: 'Body',
} as const;

const transactional: StreamEmailRequest = {
  ...base,
  stream: 'transactional',
  purpose: 'auth-otp',
  consent: { basis: 'auth-request' },
};

const broadcast: StreamEmailRequest = {
  ...base,
  stream: 'broadcast',
  purpose: 'changelog',
  consent: { basis: 'opt-in' },
  headers: UNSUB,
  approval: { cardId: 'sc_card' },
};

describe('stream registry', () => {
  it('declares every stream with a policy and no hard violations', () => {
    expect(Object.keys(EMAIL_STREAM_REGISTRY.streams).sort()).toEqual(
      [...EMAIL_STREAMS].sort()
    );
    expect(findHardViolations({})).toEqual([]);
  });

  it('never binds cold to jov.ie, a subdomain, or the Resend account', () => {
    const cold = streamPolicy('cold');
    expect(cold.status).toBe('closed');
    expect(cold.provider).not.toBe('resend');
    expect(cold.fromDomain === null || !isCoreDomain(cold.fromDomain)).toBe(
      true
    );
    expect(EMAIL_STREAM_REGISTRY.providers.resend.streams).not.toContain(
      'cold'
    );
  });

  it('requires one-click unsubscribe and a postal address on lifecycle and broadcast', () => {
    for (const stream of ['lifecycle', 'broadcast'] as const) {
      const policy = streamPolicy(stream);
      expect(policy.requiredHeaders).toEqual(
        expect.arrayContaining(['List-Unsubscribe', 'List-Unsubscribe-Post'])
      );
      expect(policy.requirePostalAddress).toBe(true);
      expect(policy.approval).toBe('summer-card');
    }
  });

  it('keeps every pause threshold at or under the Gmail 0.3% complaint line', () => {
    for (const stream of EMAIL_STREAMS) {
      expect(
        streamPolicy(stream).thresholds.complaintRatePause
      ).toBeLessThanOrEqual(0.003);
    }
  });
});

describe('send gateway contract', () => {
  it('sends transactional mail from the registry sender with stream tags', async () => {
    const { deps, send } = makeDeps();
    const result = await runGateway(transactional, deps);
    expect(result).toMatchObject({ status: 'sent', stream: 'transactional' });
    const email = send.mock.calls[0]?.[0];
    expect(email?.from).toBe('Jovie <notifications@send.jov.ie>');
    expect(email?.tags).toEqual([
      { name: 'stream', value: 'transactional' },
      { name: 'purpose', value: 'auth-otp' },
    ]);
  });

  it('rejects a cold send on send.jov.ie', async () => {
    const { deps, send, violations } = makeDeps({
      env: { EMAIL_STREAM_COLD_DOMAIN: 'send.jov.ie' },
    });
    const result = await runGateway(
      {
        ...base,
        stream: 'cold',
        purpose: 'claim-invite',
        consent: { basis: 'legitimate-interest' },
        headers: UNSUB,
        approval: { cardId: 'sc_card' },
      },
      deps
    );
    expect(result).toMatchObject({
      status: 'rejected',
      code: 'cold-on-core-domain',
    });
    expect(send).not.toHaveBeenCalled();
    expect(violations).toHaveLength(1);
  });

  it('rejects cold entirely while no cold path is approved, even off jov.ie', async () => {
    const { deps, send } = makeDeps({
      env: { EMAIL_STREAM_COLD_DOMAIN: 'meetjovie.com' },
    });
    const result = await runGateway(
      {
        ...base,
        stream: 'cold',
        purpose: 'claim-invite',
        consent: { basis: 'legitimate-interest' },
        headers: UNSUB,
        approval: { cardId: 'sc_card' },
      },
      deps
    );
    expect(result).toMatchObject({ status: 'rejected', code: 'stream-closed' });
    expect(send).not.toHaveBeenCalled();
  });

  it('rejects a send without consent', async () => {
    const { deps, send } = makeDeps();
    const result = await runGateway(
      {
        ...transactional,
        consent: undefined as unknown as StreamEmailRequest['consent'],
      },
      deps
    );
    expect(result).toMatchObject({
      status: 'rejected',
      code: 'consent-missing',
    });
    expect(send).not.toHaveBeenCalled();
  });

  it('rejects a consent basis the stream does not accept', async () => {
    const { deps } = makeDeps();
    const result = await runGateway(
      { ...broadcast, consent: { basis: 'account-transaction' } },
      deps
    );
    expect(result).toMatchObject({
      status: 'rejected',
      code: 'consent-basis-not-allowed',
    });
  });

  it('rejects an unknown or missing stream', async () => {
    const { deps } = makeDeps();
    const result = await runGateway(
      {
        ...transactional,
        stream: undefined as unknown as StreamEmailRequest['stream'],
      },
      deps
    );
    expect(result).toMatchObject({
      status: 'rejected',
      code: 'unknown-stream',
    });
  });

  it('skips a suppressed address', async () => {
    const { deps, send } = makeDeps({
      suppression: async () => ({ suppressed: true, reason: 'user_request' }),
    });
    const result = await runGateway(broadcast, deps);
    expect(result).toMatchObject({ status: 'skipped', code: 'suppressed' });
    expect(send).not.toHaveBeenCalled();
  });

  it('still sends sign-in codes to an unsubscribed address, never to a hard bounce', async () => {
    const unsubscribed = makeDeps({
      suppression: async () => ({ suppressed: true, reason: 'user_request' }),
    });
    expect(await runGateway(transactional, unsubscribed.deps)).toMatchObject({
      status: 'sent',
    });
    const bounced = makeDeps({
      suppression: async () => ({ suppressed: true, reason: 'hard_bounce' }),
    });
    expect(await runGateway(transactional, bounced.deps)).toMatchObject({
      status: 'skipped',
      code: 'suppressed',
    });
  });

  it('rejects a broadcast without the one-click unsubscribe headers', async () => {
    const { deps, send } = makeDeps();
    const result = await runGateway(
      {
        ...broadcast,
        headers: { 'List-Unsubscribe': '<https://jov.ie/u>' },
      },
      deps
    );
    expect(result).toMatchObject({
      status: 'rejected',
      code: 'required-header-missing',
    });
    expect(send).not.toHaveBeenCalled();
  });

  it('fails closed on lifecycle and broadcast until the CAN-SPAM address is set', async () => {
    const { deps, send } = makeDeps({ mailingAddress: null });
    const result = await runGateway(broadcast, deps);
    expect(result).toMatchObject({
      status: 'rejected',
      code: 'postal-address-missing',
    });
    expect(send).not.toHaveBeenCalled();
  });

  it('appends the postal footer when the body lacks it', async () => {
    const { deps, send } = makeDeps();
    await runGateway({ ...broadcast, html: '<p>Hi</p></body>' }, deps);
    const email = send.mock.calls[0]?.[0];
    expect(email?.text).toContain(ADDRESS);
    expect(email?.html).toContain(ADDRESS);
  });

  it('requires an approved Ovie card on broadcast and lifecycle', async () => {
    const missing = makeDeps();
    expect(
      await runGateway({ ...broadcast, approval: undefined }, missing.deps)
    ).toMatchObject({ status: 'rejected', code: 'approval-missing' });

    const pending = makeDeps({ cardStatus: async () => 'pending' });
    expect(await runGateway(broadcast, pending.deps)).toMatchObject({
      status: 'skipped',
      code: 'approval-pending',
    });

    const rejected = makeDeps({ cardStatus: async () => 'rejected' });
    expect(await runGateway(broadcast, rejected.deps)).toMatchObject({
      status: 'rejected',
      code: 'approval-not-approved',
    });
    expect(rejected.send).not.toHaveBeenCalled();
  });

  it('refuses a caller-chosen sender address or name where the stream fixes it', async () => {
    const { deps } = makeDeps();
    expect(
      await runGateway({ ...transactional, fromLocalPart: 'ceo' }, deps)
    ).toMatchObject({ status: 'rejected', code: 'from-not-allowed' });
    expect(
      await runGateway({ ...broadcast, fromName: 'Someone Else' }, deps)
    ).toMatchObject({ status: 'rejected', code: 'from-not-allowed' });
  });

  it('skips a paused stream but never pauses transactional', async () => {
    const paused = makeDeps({
      readPause: async () => ({ reason: 'complaints 0.4%' }),
    });
    expect(await runGateway(broadcast, paused.deps)).toMatchObject({
      status: 'skipped',
      code: 'stream-paused',
    });
    expect(await runGateway(transactional, paused.deps)).toMatchObject({
      status: 'sent',
    });
  });

  it('skips when the stream is over its hourly limit', async () => {
    const { deps, send } = makeDeps({ rateLimited: async () => true });
    expect(await runGateway(transactional, deps)).toMatchObject({
      status: 'skipped',
      code: 'rate-limited',
    });
    expect(send).not.toHaveBeenCalled();
  });

  it('sends inbox replies from the artist address on the inbox domain', async () => {
    const { deps, send } = makeDeps();
    await runGateway(
      {
        ...base,
        stream: 'inbox',
        purpose: 'inbox-routing-reply',
        consent: { basis: 'inbound-reply' },
        fromName: 'Artist via Jovie',
        fromLocalPart: 'artist',
      },
      deps
    );
    expect(send.mock.calls[0]?.[0].from).toBe(
      'Artist via Jovie <artist@jovie.fm>'
    );
  });
});
