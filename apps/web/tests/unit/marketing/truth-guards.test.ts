import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CANCEL_AND_REFUND_TRUTH,
  getPublicPriceClaims,
} from '@/lib/billing/offer-truth';

const webRoot = path.resolve(__dirname, '../../..');
const read = (rel: string) => readFileSync(path.join(webRoot, rel), 'utf8');

function listFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(path.join(webRoot, dir))) {
    const rel = path.join(dir, name);
    if (statSync(path.join(webRoot, rel)).isDirectory()) listFiles(rel, out);
    else if (
      /\.(tsx?|md)$/u.test(name) &&
      !/\.(test|spec|stories)\./u.test(name)
    )
      out.push(rel);
  }
  return out;
}

describe('published terms match the offer (phase 1 truth guard)', () => {
  const terms = read('content/legal/terms.md');

  it('states the one cancellation and refund sentence from offer-truth', () => {
    expect(terms).toContain(CANCEL_AND_REFUND_TRUTH);
  });

  it('names no plan or interval that getPublicPriceClaims does not return', () => {
    const sold = getPublicPriceClaims();
    expect(sold.some(claim => claim.annualPriceUsd !== null)).toBe(false);
    expect(terms).not.toMatch(/\bannual(?:ly)?\b|\byearly\b/iu);
    expect(terms).not.toMatch(/\bMax\b/u);
    const planSentence = terms.match(/Jovie offers[^\n]+/u)?.[0] ?? '';
    const allowed = new Set([...sold.map(claim => claim.displayName), 'Pro']);
    const mentioned = [
      ...planSentence.matchAll(
        /\b(Free|Pro|Max|Team|Business|Premium|Plus|Enterprise|Artist Presence)\b/gu
      ),
    ].map(match => match[1]);
    expect(mentioned.length).toBeGreaterThan(0);
    for (const plan of mentioned) expect(allowed.has(plan ?? '')).toBe(true);
  });
});

describe('marketing illustrations are labelled and carry no placeholder identities', () => {
  const marketingSources = [
    ...listFiles('components/marketing'),
    ...listFiles('data').filter(file => /Copy\.ts$/u.test(file)),
  ];

  it('never ships example.com in rendered marketing copy', () => {
    const offenders = marketingSources.filter(file =>
      /example\.com/iu.test(read(file))
    );
    expect(offenders).toEqual([]);
  });

  it('every component that renders sample activity renders an Example label', () => {
    const renderers = listFiles('components/marketing').filter(file =>
      /audienceRails\.map|floatingCards\.map/u.test(read(file))
    );
    expect(renderers.length).toBeGreaterThan(0);
    for (const file of renderers) {
      expect(read(file), file).toMatch(
        /ExampleLabel|ArtistNotificationFloatingCardView/u
      );
    }
    expect(read('components/marketing/MarketingStoryPrimitives.tsx')).toMatch(
      /ExampleLabel[\s\S]*audienceRails\.map/u
    );
  });
});
