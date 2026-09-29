import { render, screen } from '@testing-library/react';
import type { NextRequest } from 'next/server';
import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  defaultRecipientPreferences,
  type RecipientPreferences,
} from '@/lib/notifications/recipient-preferences';
import {
  assertProofBriefRenderable,
  type CertifiedProofBrief,
  ProofBriefError,
  proofBriefProvenance,
} from './contract';
import { prepareCustomerRecapEmail } from './delivery';
import { renderProofBriefEmail } from './email';
import {
  buildCustomerWeeklyRecap,
  CERTIFIED_PROOF_BRIEF,
  INSUFFICIENT_EVIDENCE_PROOF_BRIEF,
} from './fixture';
import {
  clampProofBriefText,
  PROOF_BRIEF_CARD_SIZE,
  PROOF_BRIEF_TEXT_LIMITS,
  ProofBriefCard,
} from './image';
import {
  buildLybProgressBrief,
  LYB_FIXTURE_PROOF_BRIEF,
  LYB_INSUFFICIENT_PROOF_BRIEF,
  type LybProgressMeasurement,
} from './lyb';
import { resolveCertifiedProofBrief } from './resolve';
import { renderProofBriefSocialDraft } from './social';
import { renderProofBriefText } from './text';

const mocks = vi.hoisted(() => ({
  imageResponse: vi.fn(),
  loadShareFonts: vi.fn(async () => ({ satoshi: new ArrayBuffer(8) })),
}));

vi.mock('next/og', () => ({
  ImageResponse: class MockImageResponse {
    headers = new Headers();
    constructor(
      public element: unknown,
      public options?: { headers?: Record<string, string> }
    ) {
      mocks.imageResponse(element, options);
      for (const [key, value] of Object.entries(options?.headers ?? {})) {
        this.headers.set(key, value);
      }
    }
  },
}));

vi.mock('@/lib/share/image-utils', async importOriginal => {
  const mod = await importOriginal<typeof import('@/lib/share/image-utils')>();
  return { ...mod, loadShareFonts: mocks.loadShareFonts };
});

import { GET as proofBriefGET } from '@/app/api/share/proof-brief/route';

const NOW = new Date('2026-09-30T00:00:00.000Z');

function brief(patch: Partial<CertifiedProofBrief> = {}): CertifiedProofBrief {
  return { ...CERTIFIED_PROOF_BRIEF, ...patch };
}

const optedInPreferences: RecipientPreferences = {
  version: 1,
  betterAuthUserId: 'tim-ba-user',
  recipientKind: 'tim',
  timezone: 'America/Los_Angeles',
  quietHours: { start: '21:00', end: '08:00' },
  weekendBehavior: 'weekend_briefing_eligible',
  briefingBehavior: 'weekend_summer',
  channels: { email: true, sms: false, push: false, in_app: true },
  marketingOptIn: true,
  marketingConsent: {
    version: 'recipient-marketing-v1',
    recordedAt: '2026-09-01T00:00:00.000Z',
  },
};

describe('Tim customer recap', () => {
  it('matches every number, date, and claim to evidence in the exact window', () => {
    const b = CERTIFIED_PROOF_BRIEF;
    const executions = b.evidence.filter(item => item.kind === 'execution');

    expect(b.window).toEqual({
      start: '2026-09-23',
      end: '2026-09-29',
      label: 'Sep 23 to Sep 29, 2026',
    });
    expect(b.hero.value).toBe(String(executions.length));
    expect(b.supportingPoints).toHaveLength(executions.length);
    expect(b.supportingPoints[0]?.evidenceIds).toContain('commit:4649c44ac0');
    expect(b.supportingPoints[1]?.evidenceIds).toContain('commit:5ac9f7320b');
    expect(
      b.evidence.every(item => item.sourceUrl.startsWith('https://'))
    ).toBe(true);

    const text = renderProofBriefText(b, { now: NOW });
    const email = renderProofBriefEmail(b, { now: NOW });
    const social = renderProofBriefSocialDraft(b, { now: NOW });
    for (const surface of [text, email.text, email.html]) {
      expect(surface).toContain('2');
      expect(surface).toContain(b.window.label);
      expect(surface).toContain('Ask Jovie');
      expect(surface).toContain('source-linked FAQs');
      expect(surface).toContain('unknown, not zero');
    }
    expect(email.text).toContain("Here's what Jovie did for you");
    expect(email.text).toContain(proofBriefProvenance(b));
    expect(email.text).not.toMatch(/href=|\*\*|##/);
    expect(social.image.url).toContain(`brief=${b.briefId}`);
    expect(social.image.url).toContain(`rev=${b.revision}`);
  });

  it('keeps an insufficient-evidence week useful without inventing a win', () => {
    const b = INSUFFICIENT_EVIDENCE_PROOF_BRIEF;
    const text = renderProofBriefText(b, { now: NOW });
    const email = renderProofBriefEmail(b, { now: NOW });

    expect(b.status).toBe('insufficient-evidence');
    expect(b.evidence).toEqual([]);
    expect(b.supportingPoints).toEqual([]);
    expect(text).toContain('does not have enough verified evidence');
    expect(text).toContain('profile visits');
    expect(text).toContain('unknown, not zero');
    expect(text).not.toMatch(/\b0 (visits|clicks|followers|sales)\b/i);
    expect(email.subject).toBe(`Your Jovie recap | ${b.window.label}`);

    render(createElement(ProofBriefCard, { brief: b, now: NOW }));
    expect(
      screen.getByText(
        'Jovie does not have enough verified evidence to recap this week yet.'
      )
    ).toBeTruthy();
    expect(
      screen.getByText('Unmeasured outcomes remain unknown, not zero.')
    ).toBeTruthy();
  });

  it('rejects a non-seven-day window and evidence outside the window', () => {
    const base = {
      briefId: 'pb_bad_window',
      revision: 1,
      subject: 'Tim White',
      window: { start: '2026-09-24', end: '2026-09-29', label: 'bad' },
      updates: [],
      evidence: [],
      unknowns: ['profile visits'],
      privacy: 'public' as const,
      generatedAt: '2026-09-29T22:00:00.000Z',
      expiresAt: '2026-10-13T00:00:00.000Z',
    };
    expect(() => buildCustomerWeeklyRecap(base)).toThrow(/exactly seven/);
    expect(() =>
      buildCustomerWeeklyRecap({
        ...base,
        window: CERTIFIED_PROOF_BRIEF.window,
        evidence: [
          {
            id: 'late',
            kind: 'observation',
            occurredAt: '2026-09-30T00:00:00.000Z',
            sourceUrl: 'https://jov.ie/tim',
            summary: 'Outside the certified window.',
          },
        ],
      })
    ).toThrow(/inside its window/);
  });
});

describe('Log Your Body progress adapter', () => {
  const lybBase = {
    briefId: 'pb_lyb_test',
    revision: 1,
    subject: 'Fixture Athlete',
    window: {
      start: '2026-09-01',
      end: '2026-09-28',
      label: 'Sep 1 to Sep 28, 2026',
    },
    unknowns: [] as string[],
    privacy: 'public' as const,
    generatedAt: '2026-09-29T22:30:00.000Z',
    expiresAt: '2026-10-13T00:00:00.000Z',
  };
  const reading = (value: number, measuredAt: string) => ({
    value,
    measuredAt,
  });
  const metric = (
    patch: Partial<LybProgressMeasurement> = {}
  ): LybProgressMeasurement => ({
    metricId: 'body-fat',
    label: 'Body fat',
    unit: 'pts',
    baseline: reading(20, '2026-09-01T08:00:00.000Z'),
    current: reading(18, '2026-09-28T08:00:00.000Z'),
    sourceUrl: 'https://logyourbody.com/u/fixture/body-fat',
    ...patch,
  });

  it('renders the fixture through every shared surface with LYB branding', () => {
    const b = LYB_FIXTURE_PROOF_BRIEF;
    expect(b.brand?.product).toBe('LogYourBody');
    expect(b.hero.value).toBe('-1.5 pts');
    expect(b.hero.label).toBe('Body fat');
    expect(b.supportingPoints).toHaveLength(3);
    expect(b.evidence.every(e => e.kind === 'observation')).toBe(true);
    expect(b.unknowns).toContain(
      'body-fat readings are estimates, not clinical measurements'
    );

    const text = renderProofBriefText(b, { now: NOW });
    const email = renderProofBriefEmail(b, { now: NOW });
    const social = renderProofBriefSocialDraft(b, { now: NOW });
    expect(text).toContain('LogYourBody measurements');
    expect(text).toContain('moved from 21.4 pts to 19.9 pts');
    expect(text).not.toContain('Jovie');
    expect(email.html).toContain('Your progress with LogYourBody');
    expect(social.copy).toContain('proof from LogYourBody.');

    render(createElement(ProofBriefCard, { brief: b, now: NOW }));
    expect(screen.getByText('Your progress with LogYourBody')).toBeTruthy();
    expect(screen.getByText('LogYourBody')).toBeTruthy();
    expect(screen.getByText('-1.5 pts')).toBeTruthy();
    expect(screen.getByText('Bench press 1RM')).toBeTruthy();
    expect(screen.getByText(proofBriefProvenance(b))).toBeTruthy();
  });

  it('resolves the LYB fixtures through the shared image route path', () => {
    expect(resolveCertifiedProofBrief(LYB_FIXTURE_PROOF_BRIEF.briefId)).toBe(
      LYB_FIXTURE_PROOF_BRIEF
    );
    expect(
      resolveCertifiedProofBrief(
        LYB_INSUFFICIENT_PROOF_BRIEF.briefId,
        LYB_INSUFFICIENT_PROOF_BRIEF.revision
      )
    ).toBe(LYB_INSUFFICIENT_PROOF_BRIEF);
  });

  it('certifies an insufficient-evidence period without inventing progress', () => {
    const b = LYB_INSUFFICIENT_PROOF_BRIEF;
    expect(b.status).toBe('insufficient-evidence');
    expect(b.supportingPoints).toEqual([]);
    const text = renderProofBriefText(b, { now: NOW });
    expect(text).toContain('does not have comparable measurements');
    expect(text).toContain('unknown, not zero');
  });

  it('rejects unpaired, out-of-window, and future measurements', () => {
    const future = metric({
      current: reading(18, '2026-10-05T08:00:00.000Z'),
    });
    const reversed = metric({
      baseline: reading(20, '2026-09-20T08:00:00.000Z'),
      current: reading(18, '2026-09-10T08:00:00.000Z'),
    });
    const outside = metric({
      baseline: reading(20, '2026-08-01T08:00:00.000Z'),
    });
    for (const bad of [future, reversed, outside]) {
      expect(() =>
        buildLybProgressBrief({ ...lybBase, measurements: [bad] })
      ).toThrow(/comparable in-window pair/);
    }
    expect(() =>
      buildLybProgressBrief({
        ...lybBase,
        measurements: Array.from({ length: 5 }, (_, i) =>
          metric({ metricId: `m${i}` })
        ),
      })
    ).toThrow(/at most 4/);
  });

  it('honors heroMetricId and signs deltas correctly', () => {
    const b = buildLybProgressBrief({
      ...lybBase,
      measurements: [
        metric(),
        metric({
          metricId: 'bench-1rm',
          label: 'Bench press 1RM',
          unit: 'lb',
          baseline: reading(185, '2026-09-02T17:00:00.000Z'),
          current: reading(200, '2026-09-26T17:00:00.000Z'),
          sourceUrl: 'https://logyourbody.com/u/fixture/bench',
        }),
      ],
      heroMetricId: 'bench-1rm',
    });
    expect(b.hero.label).toBe('Bench press 1RM');
    expect(b.hero.value).toBe('+15 lb');
    expect(b.supportingPoints[0]?.value).toBe('-2 pts');
    expect(b.hero.attribution).toBe('observed');
  });
});

describe('truth and privacy boundaries', () => {
  it('rejects unbound and over-attributed claims', () => {
    const missing = brief({
      hero: { ...CERTIFIED_PROOF_BRIEF.hero, evidenceIds: ['missing'] },
    });
    const causal = brief({
      hero: { ...CERTIFIED_PROOF_BRIEF.hero, attribution: 'causal' },
    });
    expect(() => assertProofBriefRenderable(missing, { now: NOW })).toThrow(
      ProofBriefError
    );
    expect(() => assertProofBriefRenderable(causal, { now: NOW })).toThrow(
      ProofBriefError
    );
  });

  it('rejects stale, malformed, and overfull briefs', () => {
    expect(() =>
      assertProofBriefRenderable(brief({ expiresAt: '2026-09-29T00:00:00Z' }), {
        now: NOW,
      })
    ).toThrow(/expired/);
    expect(() =>
      assertProofBriefRenderable(brief({ revision: 0 }), { now: NOW })
    ).toThrow(/proof-brief\/v1/);
    expect(() =>
      assertProofBriefRenderable(
        brief({
          supportingPoints: Array.from({ length: 4 }, (_, index) => ({
            label: `point ${index}`,
            attribution: 'execution',
            evidenceIds: ['commit:4649c44ac0'],
          })),
        }),
        { now: NOW }
      )
    ).toThrow(ProofBriefError);
  });

  it('allows owner text/email but blocks a private share card', () => {
    const privateBrief = brief({ privacy: 'private' });
    expect(renderProofBriefText(privateBrief, { now: NOW })).toContain('2');
    expect(renderProofBriefEmail(privateBrief, { now: NOW }).text).toContain(
      'Ask Jovie'
    );
    expect(() =>
      render(createElement(ProofBriefCard, { brief: privateBrief, now: NOW }))
    ).toThrow(/private-scoped/);
  });
});

describe('delivery controls', () => {
  it('does not enroll a recipient with default preferences', () => {
    const preferences = defaultRecipientPreferences({
      betterAuthUserId: 'customer-ba-user',
      recipientKind: 'customer',
      localTimezone: 'America/New_York',
    });
    expect(
      prepareCustomerRecapEmail({
        brief: CERTIFIED_PROOF_BRIEF,
        preferences,
        outboundSuppressedAt: null,
        now: NOW,
      })
    ).toEqual({ status: 'blocked', reason: 'email-disabled' });
  });

  it('requires consent and honors customer suppression', () => {
    const noConsent = {
      ...optedInPreferences,
      marketingOptIn: false,
      marketingConsent: null,
    };
    expect(
      prepareCustomerRecapEmail({
        brief: CERTIFIED_PROOF_BRIEF,
        preferences: noConsent,
        outboundSuppressedAt: null,
        now: NOW,
      })
    ).toEqual({ status: 'blocked', reason: 'marketing-consent-required' });
    expect(
      prepareCustomerRecapEmail({
        brief: CERTIFIED_PROOF_BRIEF,
        preferences: optedInPreferences,
        outboundSuppressedAt: '2026-09-20T00:00:00.000Z',
        now: NOW,
      })
    ).toEqual({ status: 'blocked', reason: 'customer-suppressed' });
  });

  it('prepares one deduplicated message for the existing delivery path', () => {
    const result = prepareCustomerRecapEmail({
      brief: CERTIFIED_PROOF_BRIEF,
      preferences: optedInPreferences,
      outboundSuppressedAt: null,
      now: NOW,
    });
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    expect(result.message.category).toBe('marketing');
    expect(result.message.channels).toEqual(['email']);
    expect(result.message.respectUserPreferences).toBe(true);
    expect(result.message.id).toBe(result.message.idempotencyKey);
    expect(result.message.text).toContain('source-linked FAQs');
    expect(result.message.metadata).toMatchObject({
      briefId: CERTIFIED_PROOF_BRIEF.briefId,
      revision: CERTIFIED_PROOF_BRIEF.revision,
      windowStart: '2026-09-23',
      windowEnd: '2026-09-29',
    });
  });
});

describe('card, resolver, and image route', () => {
  function request(url: string): NextRequest {
    return { nextUrl: new URL(url) } as NextRequest;
  }

  it('renders the certified card and clamps overflow', () => {
    render(
      createElement(ProofBriefCard, {
        brief: CERTIFIED_PROOF_BRIEF,
        now: NOW,
      })
    );
    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.getByText('verified updates')).toBeTruthy();
    expect(screen.getByText(CERTIFIED_PROOF_BRIEF.window.label)).toBeTruthy();
    expect(screen.getByText('Your week with Jovie')).toBeTruthy();
    expect(
      screen.getByText(proofBriefProvenance(CERTIFIED_PROOF_BRIEF))
    ).toBeTruthy();
    const clamped = clampProofBriefText(
      'x'.repeat(200),
      PROOF_BRIEF_TEXT_LIMITS.heroValue
    );
    expect(clamped).toHaveLength(PROOF_BRIEF_TEXT_LIMITS.heroValue);
    expect(clamped).toMatch(/…$/);
  });

  it('resolves both certified states and honors revision pins', () => {
    expect(resolveCertifiedProofBrief(CERTIFIED_PROOF_BRIEF.briefId)).toBe(
      CERTIFIED_PROOF_BRIEF
    );
    expect(
      resolveCertifiedProofBrief(
        INSUFFICIENT_EVIDENCE_PROOF_BRIEF.briefId,
        INSUFFICIENT_EVIDENCE_PROOF_BRIEF.revision
      )
    ).toBe(INSUFFICIENT_EVIDENCE_PROOF_BRIEF);
    expect(resolveCertifiedProofBrief('pb_missing')).toBeNull();
    expect(
      resolveCertifiedProofBrief(CERTIFIED_PROOF_BRIEF.briefId, 99)
    ).toBeNull();
  });

  it('rejects malformed and unknown image requests', async () => {
    expect(
      (await proofBriefGET(request('https://jov.ie/api/share/proof-brief')))
        .status
    ).toBe(400);
    const unknown = await proofBriefGET(
      request('https://jov.ie/api/share/proof-brief?brief=pb_missing')
    );
    expect(unknown.status).toBe(404);
    expect(unknown.headers.get('Cache-Control')).toBe('no-store');
  });

  it('renders the pinned card with immutable caching', async () => {
    const b = CERTIFIED_PROOF_BRIEF;
    const response = await proofBriefGET(
      request(
        `https://jov.ie/api/share/proof-brief?brief=${b.briefId}&rev=${b.revision}`
      )
    );
    expect(response.headers.get('Cache-Control')).toContain('immutable');
    expect(mocks.imageResponse).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ ...PROOF_BRIEF_CARD_SIZE })
    );
  });

  it('fails closed when fonts or rendering fail', async () => {
    const url = `https://jov.ie/api/share/proof-brief?brief=${CERTIFIED_PROOF_BRIEF.briefId}`;
    mocks.loadShareFonts.mockRejectedValueOnce(new Error('font missing'));
    expect((await proofBriefGET(request(url))).status).toBe(500);

    for (const [error, status] of [
      [new ProofBriefError('x', 'privacy-scope'), 403],
      [new ProofBriefError('x', 'stale-brief'), 410],
      [new ProofBriefError('x', 'invalid-brief'), 400],
    ] as const) {
      mocks.imageResponse.mockImplementationOnce(() => {
        throw error;
      });
      expect((await proofBriefGET(request(url))).status).toBe(status);
    }
  });
});
