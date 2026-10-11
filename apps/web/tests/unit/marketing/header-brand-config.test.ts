import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';
import { getComparison, getComparisonSlugs } from '@/content/comparisons';
import { JOVIE_CARD_COPY } from '@/data/jovieCardCopy';
import {
  headlineNamesBrand,
  MARKETING_HEADER_ICON_ONLY_PATHS,
  resolveMarketingHeaderBrand,
} from '@/data/marketing/headerBrand';

function readWebSource(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

function inlineH1Text(path: string): string {
  const match = readWebSource(path).match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
  if (!match) throw new Error(`No inline <h1> in ${path}`);
  return match[1].replace(/\s+/g, ' ').trim();
}

// Pages whose hero H1 is authored inline in the route file.
const INLINE_HERO_H1_SOURCES = {
  [APP_ROUTES.AI]: 'app/(marketing)/ai/page.tsx',
  [APP_ROUTES.DOWNLOAD]: 'app/(marketing)/download/page.tsx',
  [APP_ROUTES.ABOUT]: 'components/organisms/AboutPageContent.tsx',
} as const;

describe('marketing header brand config', () => {
  it('matches the word "Jovie" only as a whole word', () => {
    expect(headlineNamesBrand('Your Jovie profile.')).toBe(true);
    expect(headlineNamesBrand('Jovie vs Linktree')).toBe(true);
    expect(headlineNamesBrand('Control how the world sees you.')).toBe(false);
    expect(headlineNamesBrand('Jovies everywhere')).toBe(false);
  });

  it('lists exactly the copy-driven heroes whose H1 names Jovie', () => {
    const cardIconOnly = MARKETING_HEADER_ICON_ONLY_PATHS.includes(
      APP_ROUTES.CARD
    );
    expect(cardIconOnly).toBe(
      headlineNamesBrand(JOVIE_CARD_COPY.hero.headline)
    );

    for (const slug of getComparisonSlugs()) {
      const comparison = getComparison(slug);
      if (!comparison) throw new Error(`Missing comparison ${slug}`);
      expect(
        MARKETING_HEADER_ICON_ONLY_PATHS.includes(
          `${APP_ROUTES.COMPARE}/${slug}`
        ),
        `/compare/${slug}: "${comparison.heroHeadline}"`
      ).toBe(headlineNamesBrand(comparison.heroHeadline));
    }
  });

  it('lists exactly the inline-H1 heroes that name Jovie', () => {
    for (const [path, source] of Object.entries(INLINE_HERO_H1_SOURCES)) {
      const h1 = inlineH1Text(source);
      expect(
        MARKETING_HEADER_ICON_ONLY_PATHS.includes(path),
        `${path}: "${h1}"`
      ).toBe(headlineNamesBrand(h1));
    }
  });

  it('resolves icon-only from the per-page config with an explicit override', () => {
    expect(resolveMarketingHeaderBrand(APP_ROUTES.DOWNLOAD)).toBe('icon');
    expect(resolveMarketingHeaderBrand(APP_ROUTES.PRICING)).toBe('lockup');
    expect(resolveMarketingHeaderBrand(null)).toBe('lockup');
    expect(resolveMarketingHeaderBrand(APP_ROUTES.PRICING, 'icon')).toBe(
      'icon'
    );
    expect(resolveMarketingHeaderBrand(APP_ROUTES.DOWNLOAD, 'lockup')).toBe(
      'lockup'
    );
  });
});
