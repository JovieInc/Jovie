import { NextRequest, NextResponse } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ARTIST_VISIBILITY_OFFER_CONTRACT_ID } from '@/lib/billing/offer-truth';
import {
  extractCheckoutCorrelation,
  parseCheckoutCorrelation,
  toStripeCheckoutCorrelationMetadata,
} from '@/lib/stripe/checkout-correlation';
import { supportedAgentDecision } from '@/tests/fixtures/agent-handoff';
import { agentCheckoutCorrelation } from './agent-checkout-correlation';
import { buildAgentHandoffDiscovery } from './agent-handoff';
import { AGENT_INTENT_QUERY, AGENT_INTENT_TTL_MS } from './agent-intent';
import { captureFirstTouchEnvelope } from './first-touch-capture';
import {
  buildFirstTouch,
  FIRST_TOUCH_COOKIE,
  openFirstTouchEnvelope,
  sealFirstTouchEnvelope,
} from './first-touch-envelope';
import { toReceiptFirstTouch } from './first-touch-receipt';
import { reconcilePaidAcquisition } from './reconciliation';

const now = new Date('2026-10-15T18:00:00.000Z');

async function discover() {
  const discovery = await buildAgentHandoffDiscovery(
    supportedAgentDecision(now),
    now
  );
  expect(discovery.handoffUrl).toBeTruthy();
  const url = new URL(discovery.handoffUrl as string);
  const token = url.searchParams.get(AGENT_INTENT_QUERY) as string;
  return { discovery, url, token };
}

describe('signed agent handoff receipt chain', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    vi.stubEnv('ACQUISITION_FIRST_TOUCH_SECRET', 'handoff-test-signing-key');
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it('carries the exact acquisition and allowlisted source from discovery through claim and paid reconciliation', async () => {
    const { discovery, url, token } = await discover();
    expect(discovery).toMatchObject({
      price: { amount: 199, currency: 'USD', interval: 'month' },
      access: 'Limited access',
      attributionOnly: true,
      humanConfirmationRequired: true,
    });
    expect(url.pathname).toBe('/signup');
    const response = NextResponse.next();
    await captureFirstTouchEnvelope(new NextRequest(url), response);
    expect(response.cookies.get(FIRST_TOUCH_COOKIE)?.value).toBe(token);
    const envelope = await openFirstTouchEnvelope(
      response.cookies.get(FIRST_TOUCH_COOKIE)?.value
    );
    expect(envelope?.agentIntent).toEqual({
      id: expect.any(String),
      expiresAt: now.getTime() + AGENT_INTENT_TTL_MS,
      offer: ARTIST_VISIBILITY_OFFER_CONTRACT_ID,
      channel: 'agent-handoff',
      rail: 'ordinary-web-checkout',
      decisionRevision: 'decision-r4',
      matrixRevision: 'matrix-r7',
    });
    expect(envelope?.agentIntent?.id).not.toBe(envelope?.id);
    const firstTouch = toReceiptFirstTouch(envelope);
    const metadata = toStripeCheckoutCorrelationMetadata(
      agentCheckoutCorrelation(envelope)
    );
    const webhook = extractCheckoutCorrelation(metadata);
    expect(metadata).toMatchObject({
      acquisition_id: envelope?.id,
      agent_intent_id: envelope?.agentIntent?.id,
      agent_matrix_revision: 'matrix-r7',
      agent_decision_revision: 'decision-r4',
    });
    const [paid] = reconcilePaidAcquisition(
      [
        {
          logicalOrderId: 'invoice-1',
          userId: 'user-1',
          acquisitionId: webhook.acquisitionId,
          grossAmountCents: 19900,
          currency: 'usd',
          paidAt: new Date(now.getTime() + 60_000).toISOString(),
        },
      ],
      [
        {
          acquisitionId: envelope?.id as string,
          userId: 'user-1',
          capturedAt: now.toISOString(),
          identityScope: 'pre_auth_first_party_cookie',
          firstTouch: { ...firstTouch },
        },
      ],
      now.toISOString()
    );
    expect(paid).toMatchObject({
      acquisitionId: envelope?.id,
      matchingMethod: 'exact_order_correlation',
      confidence: 'exact',
      identityScope: 'pre_auth_first_party_cookie',
      causalClaim: false,
      source: { source: 'agent-handoff', agentIntent: envelope?.agentIntent },
    });
    expect(Object.keys(envelope?.agentIntent ?? {}).sort()).toEqual([
      'channel',
      'decisionRevision',
      'expiresAt',
      'id',
      'matrixRevision',
      'offer',
      'rail',
    ]);
  });

  it.each(['unknown', 'unsupported', 'partner-gated'] as const)(
    'does not issue a handoff for %s access',
    async accessState => {
      const source = supportedAgentDecision(now);
      source.decisions[0].accessState = accessState;
      expect(
        (await buildAgentHandoffDiscovery(source, now)).handoffUrl
      ).toBeNull();
    }
  );

  it('fails closed for unknown, stale, malformed, foreign and unsupported rail decisions or missing signing configuration', async () => {
    for (const input of [
      null,
      {},
      { matrixRevision: 'matrix', decisions: [] },
    ]) {
      expect(
        (await buildAgentHandoffDiscovery(input, now)).handoffUrl
      ).toBeNull();
    }
    for (const patch of [
      { rail: 'partner-checkout' },
      { rail: null },
      { channel: 'native-agent' },
      { merchantOfRecord: 'partner' },
      { decisionRevision: 'buyer@example.com' },
    ]) {
      const source = supportedAgentDecision(now);
      Object.assign(source.decisions[0], patch);
      expect(
        (await buildAgentHandoffDiscovery(source, now)).handoffUrl
      ).toBeNull();
    }
    const stale = supportedAgentDecision(
      new Date(now.getTime() - 2 * 86_400_000)
    );
    expect(
      (await buildAgentHandoffDiscovery(stale, now)).handoffUrl
    ).toBeNull();
    vi.stubEnv('ACQUISITION_FIRST_TOUCH_SECRET', '');
    expect(
      (await buildAgentHandoffDiscovery(supportedAgentDecision(now), now))
        .handoffUrl
    ).toBeNull();
  });

  it('expires agent evidence without changing the underlying first-touch identity', async () => {
    const { token } = await discover();
    const before = await openFirstTouchEnvelope(token);
    const after = await openFirstTouchEnvelope(
      token,
      now.getTime() + AGENT_INTENT_TTL_MS
    );
    expect(after?.id).toBe(before?.id);
    expect(after?.agentIntent).toBeUndefined();
    expect(agentCheckoutCorrelation(after)).toEqual({});
    expect(toReceiptFirstTouch(after)).not.toHaveProperty('agentIntent');
  });

  it('ignores tampered handoffs and never trusts unsigned agent fields', async () => {
    const { token, url } = await discover();
    const tampered = `${token.slice(0, -1)}${token.endsWith('a') ? 'b' : 'a'}`;
    expect(await openFirstTouchEnvelope(tampered)).toBeNull();
    url.searchParams.set(AGENT_INTENT_QUERY, tampered);
    url.searchParams.set('agent_rail', 'ordinary-web-checkout');
    const response = NextResponse.next();
    await captureFirstTouchEnvelope(new NextRequest(url), response);
    const opened = await openFirstTouchEnvelope(
      response.cookies.get(FIRST_TOUCH_COOKIE)?.value
    );
    expect(opened?.agentIntent).toBeUndefined();
    expect(
      parseCheckoutCorrelation({
        agentIntentId: 'forged',
        agent_rail: 'ordinary-web-checkout',
      })
    ).toEqual({});
  });

  it('rejects even signed intent with an unsupported rail or extra PII', async () => {
    const { token } = await discover();
    const envelope = await openFirstTouchEnvelope(token);
    for (const patch of [
      { rail: 'partner-checkout' },
      { email: 'buyer@example.com' },
    ]) {
      const invalid = {
        ...envelope,
        agentIntent: { ...envelope?.agentIntent, ...patch },
      };
      const sealed = await sealFirstTouchEnvelope(
        invalid as NonNullable<typeof envelope>
      );
      expect(await openFirstTouchEnvelope(sealed ?? undefined)).toBeNull();
    }
  });

  it('preserves earlier first touch across signup, claim and checkout navigation', async () => {
    const prior = buildFirstTouch({
      url: new URL('https://jov.ie/?utm_source=prior'),
    });
    const sealed = await sealFirstTouchEnvelope(prior);
    const { url } = await discover();
    for (const target of [
      url,
      new URL('https://jov.ie/claim/artist'),
      new URL('https://jov.ie/onboarding/checkout'),
    ]) {
      const response = NextResponse.next();
      await captureFirstTouchEnvelope(
        new NextRequest(target, {
          headers: { Cookie: `${FIRST_TOUCH_COOKIE}=${sealed}` },
        }),
        response
      );
      expect(response.cookies.get(FIRST_TOUCH_COOKIE)).toBeUndefined();
    }
  });
});
