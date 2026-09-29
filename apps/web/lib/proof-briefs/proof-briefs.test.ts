import { describe, expect, it } from 'vitest';
import {
  assertProofBriefRenderable,
  type CertifiedProofBrief,
  ProofBriefError,
  proofBriefProvenance,
} from './contract';
import { renderProofBriefEmail } from './email';
import { CERTIFIED_PROOF_BRIEF } from './fixture';
import { clampProofBriefText, PROOF_BRIEF_TEXT_LIMITS } from './image';
import { renderProofBriefSocialDraft } from './social';
import { renderProofBriefText } from './text';

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
