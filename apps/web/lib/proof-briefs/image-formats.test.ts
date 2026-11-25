// @vitest-environment node
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from '@/app/api/share/proof-brief/route';
import { buildProofBriefOpsCard, proofBriefImagePath } from './chat-card';
import type { CertifiedProofBrief } from './contract';
import { renderProofBriefSocialDraft } from './social';
import { renderProofBriefText } from './text';

vi.mock('./resolve', () => ({ resolveCertifiedProofBrief: vi.fn() }));

import { resolveCertifiedProofBrief } from './resolve';

const now = new Date('2026-11-25T03:00:00Z');
const longValue = '9,876,543,210,987,654.32';
const binding = { attribution: 'observed', evidenceIds: ['counter'] } as const;
const snapshot: CertifiedProofBrief = {
  schema: 'proof-brief/v1',
  briefId: 'synthetic-week',
  revision: 1,
  status: 'progress',
  subject: 'Demo Release',
  window: { start: '2026-11-18', end: '2026-11-24', label: 'Nov 18–24, 2026' },
  hero: {
    ...binding,
    value: longValue,
    label: 'Visits',
    sentence: 'Profile activity was measured.',
  },
  supportingPoints: [{ ...binding, value: '0', label: 'Ticket clicks' }],
  evidence: [
    {
      kind: 'observation',
      id: 'counter',
      sourceUrl: 'https://example.invalid/fixture',
      occurredAt: '2026-11-24T18:00:00Z',
      summary: 'Synthetic approved counter.',
    },
  ],
  privacy: 'public',
  unknowns: ['Repeat listeners'],
  generatedAt: now.toISOString(),
  expiresAt: '2026-12-02T02:00:00Z',
};

const get = (url: string) =>
  GET(new NextRequest(new URL(url, 'https://example.test')));

describe('proof image export formats', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(now);
    vi.mocked(resolveCertifiedProofBrief).mockReturnValue(snapshot);
  });
  afterEach(() => vi.useRealTimers());

  it.each([
    ['landscape', 1200, 630],
    ['square', 1080, 1080],
    ['portrait', 1080, 1350],
  ] as const)(
    'renders matching %s image bytes and a revision-pinned social draft',
    async (format, width, height) => {
      const draft = renderProofBriefSocialDraft(snapshot, { format, now });
      const originalUrl = proofBriefImagePath(snapshot);
      expect(draft.image).toEqual({
        url:
          format === 'landscape'
            ? originalUrl
            : `${originalUrl}&format=${format}`,
        width,
        height,
      });
      expect(draft.altText).toContain(longValue);
      expect(draft.altText).toContain('0 Ticket clicks');
      expect(draft.altText).toContain('Unmeasured outcomes');
      const res = await get(draft.image.url);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('image/png');
      expect(res.headers.get('cache-control')).toBe('no-store');
      const bytes = Buffer.from(await res.arrayBuffer());
      expect(bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
      expect([bytes.readUInt32BE(16), bytes.readUInt32BE(20)]).toEqual([
        width,
        height,
      ]);
    }
  );

  it.each(['unknown', '', 'toString', 'square&format=portrait'])(
    'rejects unsupported or ambiguous format %j',
    async format => {
      const res = await get(
        proofBriefImagePath(snapshot) + '&format=' + format
      );
      expect(res.status).toBe(400);
      expect(res.headers.get('cache-control')).toBe('no-store');
    }
  );

  it.each(['١٢٣٤', '१२३४', '１２３４', '−1 234,56 €'])(
    'keeps %s exact in text and omits the unavailable image',
    async value => {
      const source = { ...snapshot, hero: { ...snapshot.hero, value } };
      vi.mocked(resolveCertifiedProofBrief).mockReturnValue(source);
      const res = await get(proofBriefImagePath(source, 'portrait'));
      expect(res.status).toBe(400);
      expect(res.headers.get('cache-control')).toBe('no-store');
      expect(() =>
        renderProofBriefSocialDraft(source, { format: 'square', now })
      ).toThrow(/font/);
      expect(renderProofBriefText(source, { now })).toContain(value);
      const card = buildProofBriefOpsCard(source, { now });
      expect(card.facts.some(f => f.value === value)).toBe(true);
      expect(card.facts.some(f => f.label === 'Share image')).toBe(false);
    }
  );

  it('checks visible artwork only and declines an unreadable number or label', () => {
    const source = {
      ...snapshot,
      unknowns: ['未測定'],
      hero: { ...snapshot.hero, sentence: 'अदृश्य', value: '−1 234,56 €' },
    };
    expect(
      renderProofBriefSocialDraft(source, { format: 'square', now }).altText
    ).toContain('−1 234,56 €');
    for (const format of ['square', 'portrait'] as const) {
      expect(() =>
        renderProofBriefSocialDraft(
          { ...source, hero: { ...source.hero, value: '9'.repeat(150) } },
          { format, now }
        )
      ).toThrow(/does not fit/);
      expect(() =>
        renderProofBriefSocialDraft(
          { ...source, window: { ...source.window, label: 'W'.repeat(40) } },
          { format, now }
        )
      ).toThrow(/label does not fit/);
    }
  });
});
