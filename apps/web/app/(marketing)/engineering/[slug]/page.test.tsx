import { describe, expect, it, vi } from 'vitest';
import { applyRootTitleTemplate } from '@/lib/seo/document-title';

vi.mock('@/lib/engineering-publication', () => ({
  getPublishedEngineeringStories: async () => [
    {
      slug: 'shipping-record',
      source: {
        title: 'Shipping record',
        summary: 'What already shipped.',
        date: '2026-08-30',
      },
    },
  ],
  findEngineeringStory: (records: readonly { slug: string }[], slug: string) =>
    records.find(record => record.slug === slug),
}));

import { generateMetadata } from './page';

describe('engineering story document title', () => {
  it('opts the suffixed story title out of the root template', async () => {
    const metadata = await generateMetadata({
      params: Promise.resolve({ slug: 'shipping-record' }),
    });

    expect(applyRootTitleTemplate(metadata.title)).toBe(
      'Shipping record | Jovie'
    );
    expect(applyRootTitleTemplate(metadata.title)).not.toMatch(
      /Jovie \| Jovie/
    );
  });
});
