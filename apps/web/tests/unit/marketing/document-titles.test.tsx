import type { Metadata } from 'next';
import { describe, expect, it } from 'vitest';
import { metadata as aboutMetadata } from '@/app/(marketing)/about/page';
import { metadata as aiMetadata } from '@/app/(marketing)/ai/page';
import { metadata as alternativesMetadata } from '@/app/(marketing)/alternatives/page';
import { metadata as apiVersioningMetadata } from '@/app/(marketing)/api-versioning/page';
import { metadata as cardMetadata } from '@/app/(marketing)/card/page';
import { metadata as changelogMetadata } from '@/app/(marketing)/changelog/page';
import { metadata as cliMetadata } from '@/app/(marketing)/cli/page';
import { metadata as compareMetadata } from '@/app/(marketing)/compare/page';
import { metadata as developersMetadata } from '@/app/(marketing)/developers/page';
import { metadata as downloadMetadata } from '@/app/(marketing)/download/page';
import { metadata as instantMerchMetadata } from '@/app/(marketing)/instant-merch/page';
import { metadata as integrationsMetadata } from '@/app/(marketing)/integrations/page';
import { metadata as pricingLayoutMetadata } from '@/app/(marketing)/pricing/layout';
import { metadata as pricingMetadata } from '@/app/(marketing)/pricing/page';
import { metadata as voiceMetadata } from '@/app/(marketing)/voice/page';
import { APP_NAME } from '@/constants/app';
import { COMPANY_IDENTITY } from '@/data/companyIdentity';
import {
  applyRootTitleTemplate,
  documentTitle,
} from '@/lib/seo/document-title';

const DOUBLED_SUFFIX =
  /\| Jovie \| Jovie|— Jovie \| Jovie| - Jovie \| Jovie|\bJovie \| Jovie\b/;

describe('documentTitle', () => {
  it('locks the opt-out word to the root template brand', () => {
    expect(APP_NAME).toBe('Jovie');
    expect(
      applyRootTitleTemplate(documentTitle(`Notes about ${APP_NAME}`))
    ).toBe(`Notes about ${APP_NAME}`);
  });

  it('lets the root template add the brand once when the title omits it', () => {
    expect(documentTitle('Support')).toBe('Support');
    expect(applyRootTitleTemplate(documentTitle('Support'))).toBe(
      `Support | ${APP_NAME}`
    );
  });

  it('opts out of the template when the title already names Jovie', () => {
    for (const title of [
      'Compare — Jovie',
      'Alternatives — Jovie',
      'CLI — Jovie',
      'Integrations | Jovie',
      'Developers - Jovie',
      'Pricing | Jovie',
      'Jovie Pricing',
      'Download Jovie',
      'Start with Jovie',
    ]) {
      const resolved = applyRootTitleTemplate(documentTitle(title));
      expect(resolved).toBe(title);
      expect(resolved).not.toMatch(DOUBLED_SUFFIX);
    }
  });
});

describe('marketing document titles', () => {
  it('keeps the listed pages to a single brand suffix', () => {
    const resolved = [
      applyRootTitleTemplate(compareMetadata.title),
      applyRootTitleTemplate(alternativesMetadata.title),
      applyRootTitleTemplate(cliMetadata.title),
      applyRootTitleTemplate(integrationsMetadata.title),
      applyRootTitleTemplate(pricingMetadata.title),
      applyRootTitleTemplate(aboutMetadata.title),
    ];

    expect(resolved).toEqual([
      'Compare — Jovie',
      'Alternatives — Jovie',
      'CLI — Jovie',
      'Integrations | Jovie',
      'Pricing | Jovie',
      `About Jovie: ${COMPANY_IDENTITY.headline.replace(/\.$/, '')}`,
    ]);
    for (const title of resolved) {
      expect(title).not.toMatch(DOUBLED_SUFFIX);
    }
  });

  it('keeps every branded marketing title to a single announcement', () => {
    const titles: Metadata['title'][] = [
      aiMetadata.title,
      apiVersioningMetadata.title,
      cardMetadata.title,
      changelogMetadata.title,
      developersMetadata.title,
      downloadMetadata.title,
      instantMerchMetadata.title,
      pricingLayoutMetadata.title,
      voiceMetadata.title,
    ];

    for (const title of titles) {
      const resolved = applyRootTitleTemplate(title);
      expect(resolved).not.toMatch(DOUBLED_SUFFIX);
      if (
        title &&
        typeof title === 'object' &&
        'absolute' in title &&
        typeof title.absolute === 'string'
      ) {
        expect(resolved).toBe(title.absolute);
      }
    }
  });
});
