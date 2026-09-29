import { describe, expect, it, vi } from 'vitest';
import { evaluateBrief } from '@/lib/proof-briefs/certify';
import {
  briefHashMatches,
  composeProofBrief,
} from '@/lib/proof-briefs/compose';
import {
  CONFLICTING_METRIC_EVENT,
  FILLER_EVENTS,
  JARGON_EVENT,
  JOVIE_ENTITY_ID,
  JOVIE_EVENTS,
  JOVIE_INVESTOR_REQUEST,
  makeEvent,
  OVERCLAIM_EVENT,
  STALE_EVENT,
  TIM_CUSTOMER_REQUEST,
  TIM_EVENTS,
} from '@/lib/proof-briefs/fixtures';
import type { ProofBrief } from '@/lib/proof-briefs/types';

const failChecks = (brief: ProofBrief, events = JOVIE_EVENTS) =>
  evaluateBrief(brief, events).filter(f => f.severity === 'fail');

describe('composeProofBrief', () => {
  it('certifies the Jovie investor dogfood brief', () => {
    const { brief } = composeProofBrief(JOVIE_INVESTOR_REQUEST, JOVIE_EVENTS);
    expect(brief).not.toBeNull();
    expect(brief?.certification.result).toBe('certified');
    expect(brief?.hero.eventId).toBe('ev-jov-load-time');
    expect(brief?.hero.wording).toBe(
      'Shipped a faster public artist page. Median load time fell from 420 to 310 ms over 7d.'
    );
    expect(brief?.supporting.map(s => s.eventId)).toEqual([
      'ev-jov-waitlist-gate',
      'ev-jov-proof-claim',
    ]);
    expect(brief?.evidence).toEqual([
      { id: 'ev-jov-load-time', revision: 'r3' },
      { id: 'ev-jov-waitlist-gate', revision: 'r1' },
      { id: 'ev-jov-proof-claim', revision: 'r2' },
    ]);
  });

  it('keeps internal-only evidence out of the investor variant', () => {
    const { brief } = composeProofBrief(JOVIE_INVESTOR_REQUEST, JOVIE_EVENTS);
    expect(brief?.evidence.map(e => e.id)).not.toContain('ev-jov-churn-detail');
    expect(brief?.disclosureScope).toBe('public');
  });

  it('certifies Tim’s customer brief and preserves attribution caveats', () => {
    const { brief } = composeProofBrief(TIM_CUSTOMER_REQUEST, TIM_EVENTS);
    expect(brief).not.toBeNull();
    expect(brief?.certification.result).toBe('certified');
    expect(brief?.hero.wording).toBe(
      'Your profile now gives fans one place to stream, buy and get updates.'
    );
    // Correlated metric keeps its limitation + the auto-attribution caveat.
    expect(brief?.limitations).toContain(
      'Visits include repeat views from the same fans.'
    );
    expect(brief?.limitations).toContain(
      'Observed in the same window; not attributed to this work.'
    );
  });

  it('never leaks private customer data into an investor variant', () => {
    const request = {
      ...TIM_CUSTOMER_REQUEST,
      audience: 'investor' as const,
      disclosureScope: 'public' as const,
    };
    const { brief } = composeProofBrief(request, TIM_EVENTS);
    // Every Tim event is 'private' → nothing eligible → fail closed.
    expect(brief).toBeNull();
  });

  it('fails closed when no event clears the hero bar', () => {
    const { brief, rejectedReason } = composeProofBrief(
      JOVIE_INVESTOR_REQUEST,
      FILLER_EVENTS
    );
    expect(brief).toBeNull();
    expect(rejectedReason).toContain('hero');
  });

  it('is immutable: material change invalidates the snapshot', () => {
    const { brief } = composeProofBrief(JOVIE_INVESTOR_REQUEST, JOVIE_EVENTS);
    expect(brief && briefHashMatches(brief)).toBe(true);
    const tampered = {
      ...brief!,
      hero: { ...brief!.hero, wording: 'We 10x’d everything.' },
    };
    expect(briefHashMatches(tampered)).toBe(false);
  });
});

describe('certification — negative fixtures', () => {
  it('rejects jargon-heavy wording even when the claim is true', () => {
    const { brief } = composeProofBrief(JOVIE_INVESTOR_REQUEST, [JARGON_EVENT]);
    expect(brief?.certification.result).toBe('rejected');
    expect(failChecks(brief!, [JARGON_EVENT]).map(f => f.check)).toContain(
      'understandable'
    );
  });

  it('rejects unsupported causal language on correlated evidence', () => {
    const { brief } = composeProofBrief(JOVIE_INVESTOR_REQUEST, [
      OVERCLAIM_EVENT,
    ]);
    expect(brief?.certification.result).toBe('rejected');
    expect(failChecks(brief!, [OVERCLAIM_EVENT]).map(f => f.check)).toContain(
      'no-overclaim'
    );
  });

  it('excludes stale evidence from the window', () => {
    const { brief } = composeProofBrief(JOVIE_INVESTOR_REQUEST, [
      JOVIE_EVENTS[0],
      STALE_EVENT,
    ]);
    expect(brief?.evidence.map(e => e.id)).not.toContain('ev-neg-stale');
  });

  it('rejects when a conflicting metric is omitted', () => {
    const events = [JOVIE_EVENTS[0], CONFLICTING_METRIC_EVENT];
    const { brief } = composeProofBrief(JOVIE_INVESTOR_REQUEST, events);
    expect(brief?.certification.result).toBe('rejected');
    expect(failChecks(brief!, events).map(f => f.check)).toContain(
      'no-material-omission'
    );
  });

  it('rejects private evidence selected into a public brief', () => {
    // Composer clamps scope, so hand-build the violating draft to prove the
    // certifier is the backstop, not the composer.
    const { brief: customerBrief } = composeProofBrief(
      TIM_CUSTOMER_REQUEST,
      TIM_EVENTS
    );
    const leaked: ProofBrief = {
      ...customerBrief!,
      audience: 'investor',
      disclosureScope: 'public',
    };
    const checks = failChecks(leaked, TIM_EVENTS).map(f => f.check);
    expect(checks).toContain('disclosure-bound');
  });

  it('does not pad to three bullets with weak items', () => {
    const { brief } = composeProofBrief(JOVIE_INVESTOR_REQUEST, [
      JOVIE_EVENTS[0],
      ...FILLER_EVENTS,
    ]);
    expect(brief?.certification.result).toBe('certified');
    expect(brief?.supporting).toHaveLength(0);
  });

  it('rejects a brief missing a required denominator', () => {
    const noDenominator = makeEvent({
      id: 'ev-neg-denominator',
      subjectEntityId: JOVIE_ENTITY_ID,
      did: 'measured waitlist conversion',
      changed: 'conversion rose from 12 to 18 over 7d',
      attribution: 'direct',
      metric: {
        predicate: 'waitlist-conversion-rate',
        label: 'Waitlist conversion rate',
        before: 12,
        after: 18,
        unit: '%',
        window: '7d',
      },
      audienceRelevance: { investor: 0.9 },
    });
    const { brief } = composeProofBrief(JOVIE_INVESTOR_REQUEST, [
      noDenominator,
    ]);
    expect(brief?.certification.result).toBe('rejected');
    expect(failChecks(brief!, [noDenominator]).map(f => f.check)).toContain(
      'denominators'
    );
  });
});

import { render, screen } from '@testing-library/react';
import type { NextRequest } from 'next/server';
import { createElement } from 'react';
import {
  assertProofBriefRenderable,
  type CertifiedProofBrief,
  ProofBriefError,
  proofBriefProvenance,
} from './contract';
import { renderProofBriefEmail } from './email';
import { CERTIFIED_PROOF_BRIEF } from './fixture';
import {
  clampProofBriefText,
  PROOF_BRIEF_CARD_SIZE,
  PROOF_BRIEF_TEXT_LIMITS,
  ProofBriefCard,
} from './image';
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

const NOW = new Date('2026-09-22T12:00:00.000Z');

function brief(patch: Partial<CertifiedProofBrief> = {}): CertifiedProofBrief {
  return { ...CERTIFIED_PROOF_BRIEF, ...patch };
}

describe('single-source rendering', () => {
  it('renders the same values, dates, and revision on every surface', () => {
    const text = renderProofBriefText(CERTIFIED_PROOF_BRIEF, { now: NOW });
    const email = renderProofBriefEmail(CERTIFIED_PROOF_BRIEF, { now: NOW });
    const social = renderProofBriefSocialDraft(CERTIFIED_PROOF_BRIEF, {
      now: NOW,
    });

    for (const surface of [text, email.text, email.html]) {
      expect(surface).toContain('263');
      expect(surface).toContain('Sep 14 – Sep 20, 2026');
      expect(surface).toContain('4,812');
      expect(surface).toContain('91');
      expect(surface).toContain('12');
    }

    expect(text).toContain(
      '263 new listeners clicked through to your music this week.'
    );
    expect(email.text).toContain(proofBriefProvenance(CERTIFIED_PROOF_BRIEF));
    expect(email.html).toContain(proofBriefProvenance(CERTIFIED_PROOF_BRIEF));
    expect(email.subject).toContain('263');
    expect(email.subject).toContain('Sep 14 – Sep 20, 2026');

    expect(social.copy).toContain('263');
    expect(social.copy).toContain('Sep 14 – Sep 20, 2026');
    expect(social.image.url).toContain(
      `brief=${CERTIFIED_PROOF_BRIEF.briefId}`
    );
    expect(social.image.url).toContain(`rev=${CERTIFIED_PROOF_BRIEF.revision}`);
  });

  it('email is useful without a click', () => {
    const email = renderProofBriefEmail(CERTIFIED_PROOF_BRIEF, { now: NOW });
    expect(email.text).toContain("Here's what Jovie did for Tim White");
    expect(email.text).not.toMatch(/\*\*|##|href=/);
  });
});

describe('supporting points', () => {
  it('renders 0 points gracefully on every surface', () => {
    const b = brief({ supportingPoints: [] });
    const text = renderProofBriefText(b, { now: NOW });
    const email = renderProofBriefEmail(b, { now: NOW });
    const social = renderProofBriefSocialDraft(b, { now: NOW });

    expect(text).not.toContain('4,812');
    expect(email.html).toContain('263');
    expect(social.copy).toContain('263');
  });

  it('renders a single point', () => {
    const b = brief({
      supportingPoints: [{ value: '1,204,318', label: 'profile visits' }],
    });
    expect(renderProofBriefText(b, { now: NOW })).toContain(
      '1,204,318 profile visits'
    );
  });

  it('rejects more than 3 supporting points', () => {
    const b = brief({
      supportingPoints: Array.from({ length: 4 }, (_, i) => ({
        value: String(i),
        label: `point ${i}`,
      })),
    });
    expect(() => renderProofBriefText(b, { now: NOW })).toThrow(
      ProofBriefError
    );
    expect(() => renderProofBriefText(b, { now: NOW })).toThrow(
      /proof-brief\/v1/
    );
  });
});

describe('hero variants', () => {
  it('supports a non-numeric hero', () => {
    const b = brief({
      hero: { sentence: 'Your release hit three new editorial playlists.' },
    });
    const text = renderProofBriefText(b, { now: NOW });
    const email = renderProofBriefEmail(b, { now: NOW });
    const social = renderProofBriefSocialDraft(b, { now: NOW });

    expect(text).toContain('editorial playlists');
    expect(email.text).toContain('editorial playlists');
    expect(social.copy).toContain('4,812 profile visits');
  });

  it('formats large values unchanged across surfaces', () => {
    const b = brief({
      hero: {
        sentence:
          '1,204,318 new listeners clicked through to your music this week.',
        value: '1,204,318',
        label: 'new listeners clicked through',
      },
    });
    expect(renderProofBriefText(b, { now: NOW })).toContain('1,204,318');
    expect(renderProofBriefEmail(b, { now: NOW }).html).toContain('1,204,318');
    expect(renderProofBriefSocialDraft(b, { now: NOW }).copy).toContain(
      '1,204,318'
    );
  });
});

describe('copy clamps', () => {
  it('clamps long copy for visual overflow safety', () => {
    const long = 'x'.repeat(200);
    expect(
      clampProofBriefText(long, PROOF_BRIEF_TEXT_LIMITS.heroValue)
    ).toHaveLength(PROOF_BRIEF_TEXT_LIMITS.heroValue);
    expect(
      clampProofBriefText(long, PROOF_BRIEF_TEXT_LIMITS.heroValue)
    ).toMatch(/…$/);
    expect(clampProofBriefText('263', PROOF_BRIEF_TEXT_LIMITS.heroValue)).toBe(
      '263'
    );
  });
});

describe('rejection paths', () => {
  it('rejects a stale brief on every surface', () => {
    const stale = brief({ expiresAt: '2026-09-21T00:00:00.000Z' });
    for (const render of [
      renderProofBriefText,
      renderProofBriefEmail,
      renderProofBriefSocialDraft,
    ]) {
      expect(() => render(stale as never, { now: NOW })).toThrow(
        ProofBriefError
      );
    }
    expect(() => assertProofBriefRenderable(stale, { now: NOW })).toThrowError(
      /expired/
    );
  });

  it('rejects private-scope briefs on public surfaces but allows email', () => {
    const priv = brief({ privacy: 'private' });
    expect(() => renderProofBriefSocialDraft(priv, { now: NOW })).toThrow(
      /private-scoped/
    );
    expect(renderProofBriefEmail(priv, { now: NOW }).text).toContain('263');
    expect(renderProofBriefText(priv, { now: NOW })).toContain('263');
  });

  it('rejects malformed briefs', () => {
    expect(() =>
      assertProofBriefRenderable(brief({ revision: 0 }), { now: NOW })
    ).toThrow(ProofBriefError);
    expect(() =>
      assertProofBriefRenderable(brief({ briefId: '' }), { now: NOW })
    ).toThrow(ProofBriefError);
  });
});

describe('resolveCertifiedProofBrief', () => {
  it('resolves the certified brief by id', () => {
    expect(resolveCertifiedProofBrief(CERTIFIED_PROOF_BRIEF.briefId)).toBe(
      CERTIFIED_PROOF_BRIEF
    );
  });

  it('honors a matching revision pin', () => {
    expect(
      resolveCertifiedProofBrief(
        CERTIFIED_PROOF_BRIEF.briefId,
        CERTIFIED_PROOF_BRIEF.revision
      )
    ).toBe(CERTIFIED_PROOF_BRIEF);
  });

  it('returns null for an unknown id or mismatched revision', () => {
    expect(resolveCertifiedProofBrief('pb_missing')).toBeNull();
    expect(
      resolveCertifiedProofBrief(CERTIFIED_PROOF_BRIEF.briefId, 99)
    ).toBeNull();
  });
});

describe('ProofBriefCard', () => {
  it('renders hero value, label, window, points, and provenance', () => {
    render(
      createElement(ProofBriefCard, { brief: CERTIFIED_PROOF_BRIEF, now: NOW })
    );
    expect(screen.getByText('263')).toBeTruthy();
    expect(screen.getByText('new listeners clicked through')).toBeTruthy();
    expect(screen.getByText('Sep 14 – Sep 20, 2026')).toBeTruthy();
    expect(screen.getByText('4,812')).toBeTruthy();
    expect(
      screen.getByText(proofBriefProvenance(CERTIFIED_PROOF_BRIEF))
    ).toBeTruthy();
    expect(screen.getByText('Weekly proof')).toBeTruthy();
    expect(screen.getByText('Jovie')).toBeTruthy();
  });

  it('renders the sentence as hero for a non-numeric brief', () => {
    const b = brief({
      hero: { sentence: 'Your release hit three new editorial playlists.' },
      supportingPoints: [{ label: 'qualitative win' }],
    });
    render(createElement(ProofBriefCard, { brief: b, now: NOW }));
    expect(
      screen.getByText('Your release hit three new editorial playlists.')
    ).toBeTruthy();
    expect(screen.getByText('qualitative win')).toBeTruthy();
  });

  it('omits the proof strip when there are no supporting points', () => {
    const b = brief({ supportingPoints: [] });
    render(createElement(ProofBriefCard, { brief: b, now: NOW }));
    expect(screen.queryByText('4,812')).toBeNull();
    expect(screen.getByText('263')).toBeTruthy();
  });

  it('renders a supporting point with no value', () => {
    const b = brief({
      supportingPoints: [{ label: 'editorial playlist add' }],
    });
    render(createElement(ProofBriefCard, { brief: b, now: NOW }));
    expect(screen.getByText('editorial playlist add')).toBeTruthy();
  });

  it('rejects private briefs on the public image surface', () => {
    const priv = brief({ privacy: 'private' });
    expect(() =>
      render(createElement(ProofBriefCard, { brief: priv, now: NOW }))
    ).toThrow(ProofBriefError);
  });
});

describe('proof-brief image route', () => {
  function request(url: string): NextRequest {
    return { nextUrl: new URL(url) } as NextRequest;
  }

  it('rejects a missing or malformed brief id', async () => {
    for (const url of [
      'https://jov.ie/api/share/proof-brief',
      'https://jov.ie/api/share/proof-brief?brief=',
      'https://jov.ie/api/share/proof-brief?brief=bad%20id!',
    ]) {
      const response = await proofBriefGET(request(url));
      expect(response.status).toBe(400);
      expect(response.headers.get('Cache-Control')).toBe('no-store');
    }
  });

  it('404s for unknown briefs and mismatched revision pins', async () => {
    for (const url of [
      'https://jov.ie/api/share/proof-brief?brief=pb_missing',
      `https://jov.ie/api/share/proof-brief?brief=${CERTIFIED_PROOF_BRIEF.briefId}&rev=99`,
    ]) {
      const response = await proofBriefGET(request(url));
      expect(response.status).toBe(404);
      expect(response.headers.get('Cache-Control')).toBe('no-store');
    }
  });

  it('renders an immutable card for the certified brief', async () => {
    const response = await proofBriefGET(
      request(
        `https://jov.ie/api/share/proof-brief?brief=${CERTIFIED_PROOF_BRIEF.briefId}&rev=${CERTIFIED_PROOF_BRIEF.revision}`
      )
    );
    expect(response.headers.get('Cache-Control')).toContain('immutable');
    expect(mocks.imageResponse).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ ...PROOF_BRIEF_CARD_SIZE })
    );
  });

  it('treats a non-numeric revision as no pin', async () => {
    const response = await proofBriefGET(
      request(
        `https://jov.ie/api/share/proof-brief?brief=${CERTIFIED_PROOF_BRIEF.briefId}&rev=abc`
      )
    );
    expect(response.headers.get('Cache-Control')).toContain('immutable');
  });

  it('returns 500 when fonts cannot load', async () => {
    mocks.loadShareFonts.mockRejectedValueOnce(new Error('font missing'));
    const response = await proofBriefGET(
      request(
        `https://jov.ie/api/share/proof-brief?brief=${CERTIFIED_PROOF_BRIEF.briefId}`
      )
    );
    expect(response.status).toBe(500);
  });

  it('maps render failures to the right status', async () => {
    const cases: Array<[unknown, number]> = [
      [new ProofBriefError('x', 'privacy-scope'), 403],
      [new ProofBriefError('x', 'stale-brief'), 410],
      [new ProofBriefError('x', 'invalid-brief'), 400],
      [new Error('boom'), 400],
    ];
    for (const [error, status] of cases) {
      mocks.imageResponse.mockImplementationOnce(() => {
        throw error;
      });
      const response = await proofBriefGET(
        request(
          `https://jov.ie/api/share/proof-brief?brief=${CERTIFIED_PROOF_BRIEF.briefId}`
        )
      );
      expect(response.status).toBe(status);
      expect(response.headers.get('Cache-Control')).toBe('no-store');
    }
  });
});
