import { describe, expect, it } from 'vitest';
import { SOLUTIONS_PAGE_RECORDS } from '@/content/pages/solutions';
import { solutionsArtistsPage } from '@/content/pages/solutions/artists';
import { listProductTruthClaims } from '@/data/product-truth/claims';
import { PROOF_REGISTRY } from '@/data/product-truth/proof';
import type { Claim } from '@/data/product-truth/registry';
import {
  definePage,
  findUnresolvedRecordClaims,
  isIndexedPageRecord,
  isRoutedPageRecord,
  type PageRecordInput,
  PageRecordSchema,
  pageRecordPath,
  resolvePageCopy,
} from './pageRecord';
import { buildPageRecordMetadata } from './pageRecordMetadata';

const CLAIMS: readonly Claim[] = [
  {
    id: 'capability.demo.job',
    capabilityId: 'demo',
    statement: 'demo job statement',
    kind: 'capability',
    source: 'feature',
  },
];

function baseInput(overrides: Partial<PageRecordInput> = {}): PageRecordInput {
  return {
    id: 'solutions.demo',
    family: 'solutions',
    slug: 'demo',
    status: 'noindex',
    brief: { audience: 'demo', job: 'demo job', successEvent: 'signs up' },
    claims: ['capability.demo.job'],
    composition: {
      recipeId: 'artist-lp',
      penContractId: 'DRJv9',
      sections: [{ renderer: 'artist-hero-adaptive-intro', sectionId: 'hero' }],
    },
    heroVariant: 'split-link-claim',
    seo: {
      title: 'Demo',
      description: 'Demo description.',
      schema: ['SoftwareApplication'],
      hub: null,
      ogImage: '/og/default.png',
    },
    trust: null,
    updatedAt: '2026-09-30',
    ...overrides,
  };
}

function issuesFor(input: PageRecordInput): string[] {
  const result = PageRecordSchema.safeParse(input);
  return result.success ? [] : result.error.issues.map(i => i.message);
}

const DIGEST = `sha256:${'a'.repeat(64)}`;

function withMedia(media: Record<string, unknown>): PageRecordInput {
  return baseInput({ media: { 'hero-1': media } as PageRecordInput['media'] });
}

describe('generated section media (JOV-7765)', () => {
  const image = {
    kind: 'generated',
    id: '/marketing/factory/hero.avif',
    alt: 'Generated hero',
    mime: 'image/avif',
    width: 1600,
    height: 1000,
    digest: DIGEST,
  };

  it('accepts a sized, hashed render and a video with its poster', () => {
    expect(issuesFor(withMedia(image))).toEqual([]);
    expect(
      issuesFor(
        withMedia({
          ...image,
          id: '/marketing/factory/hero.mp4',
          mime: 'video/mp4',
          poster: '/marketing/factory/hero-poster.avif',
          captions: '/marketing/factory/hero.vtt',
        })
      )
    ).toEqual([]);
  });

  it.each([
    [
      'a video without a poster',
      { id: '/f/a.mp4', mime: 'video/mp4', captions: '/f/a.vtt' },
    ],
    [
      'a video without captions',
      { id: '/f/a.mp4', mime: 'video/mp4', poster: '/f/p.avif' },
    ],
    ['a poster on an image', { poster: '/f/p.avif' }],
    ['captions on an image', { captions: '/f/a.vtt' }],
  ])('rejects %s', (_label, change) => {
    expect(issuesFor(withMedia({ ...image, ...change }))).toHaveLength(1);
  });

  it.each([
    ['an unhashed render', { digest: 'abc' }],
    ['an unsized render', { width: 0 }],
    ['an off-origin file', { id: 'https://cdn.example.com/a.avif' }],
    ['a protocol-relative file', { id: '//cdn.example.com/a.avif' }],
    ['an unsupported type', { mime: 'image/gif' }],
    ['an unknown field', { autoplay: true }],
  ])('rejects %s', (_label, change) => {
    expect(issuesFor(withMedia({ ...image, ...change }))).not.toEqual([]);
  });

  it('keeps the existing registry and public-path refs valid', () => {
    expect(
      issuesFor(
        withMedia({ kind: 'public-path', id: '/og/default.png', alt: 'OG' })
      )
    ).toEqual([]);
  });
});

describe('PageRecordSchema', () => {
  it('accepts a minimal record and fills defaults', () => {
    const record = definePage(baseInput());
    expect(record.copy).toEqual({});
    expect(record.media).toEqual({});
    expect(record.receipts).toEqual([]);
    expect(record.seo.keywords).toEqual([]);
    expect(pageRecordPath(record)).toBe('/solutions/demo');
  });

  it('requires the id to be family.slug', () => {
    expect(issuesFor(baseInput({ id: 'solutions.other' }))).toContain(
      'id must be "solutions.demo"'
    );
  });

  it('requires the composition to open with the hero', () => {
    expect(
      issuesFor(
        baseInput({
          composition: {
            recipeId: 'artist-lp',
            penContractId: 'DRJv9',
            sections: [{ renderer: 'artist-faq', sectionId: 'faq' }],
          },
        })
      )
    ).toContain('composition must open with the hero section');
  });

  it('rejects a renderer composed twice', () => {
    const hero = { renderer: 'artist-hero-adaptive-intro', sectionId: 'hero' };
    expect(
      issuesFor(
        baseInput({
          composition: {
            recipeId: 'artist-lp',
            penContractId: 'DRJv9',
            sections: [
              hero,
              hero,
            ] as PageRecordInput['composition']['sections'],
          },
        })
      )
    ).toContain('composition renderers must be unique');
  });

  it('allows a generic renderer to serve unique section instances', () => {
    expect(
      issuesFor(
        baseInput({
          composition: {
            recipeId: 'artist-lp',
            penContractId: 'DRJv9',
            sections: [
              {
                renderer: 'factory-hero',
                instanceId: 'hero-1',
                sectionId: 'hero',
              },
              {
                renderer: 'factory-feature-split',
                instanceId: 'feature-split-1',
                sectionId: 'feature-split',
              },
              {
                renderer: 'factory-feature-split',
                instanceId: 'feature-split-2',
                sectionId: 'feature-split',
              },
            ],
          },
        })
      )
    ).toEqual([]);
  });

  it('rejects duplicate generic section instance ids', () => {
    expect(
      issuesFor(
        baseInput({
          composition: {
            recipeId: 'artist-lp',
            penContractId: 'DRJv9',
            sections: [
              {
                renderer: 'factory-hero',
                instanceId: 'section-1',
                sectionId: 'hero',
              },
              {
                renderer: 'factory-cta',
                instanceId: 'section-1',
                sectionId: 'cta',
              },
            ],
          },
        })
      )
    ).toContain('composition instance ids must be unique');
  });

  it('rejects claim-backed copy whose claim is not declared', () => {
    expect(
      issuesFor(
        baseInput({ copy: { 'hero.proof': { claimRef: 'capability.x.y' } } })
      )
    ).toContain(
      'copy slot hero.proof references capability.x.y, which is not in claims[]'
    );
  });

  it('rejects unknown section ids, statuses, and malformed receipts', () => {
    const bad = {
      ...baseInput(),
      status: 'live',
      receipts: [{ stage: 'truth', digest: 'md5:abc' }],
    } as unknown as PageRecordInput;
    expect(PageRecordSchema.safeParse(bad).success).toBe(false);
    expect(
      PageRecordSchema.safeParse(
        baseInput({
          composition: {
            recipeId: 'artist-lp',
            penContractId: 'DRJv9',
            sections: [
              {
                renderer: 'hero',
                sectionId: 'not-a-section' as 'hero',
              },
            ],
          },
        })
      ).success
    ).toBe(false);
  });

  it('definePage throws with every issue path listed', () => {
    expect(() =>
      definePage(baseInput({ id: 'bad.id', claims: [] }))
    ).toThrowError(/Invalid page record bad\.id: claims: .*id: id must be/u);
  });
});

describe('ramp state', () => {
  it('routes noindex and indexed records only, and indexes only indexed', () => {
    const byStatus = (['shadow', 'noindex', 'indexed', 'pruned'] as const).map(
      status => definePage(baseInput({ status }))
    );
    expect(byStatus.map(isRoutedPageRecord)).toEqual([
      false,
      true,
      true,
      false,
    ]);
    expect(byStatus.map(isIndexedPageRecord)).toEqual([
      false,
      false,
      true,
      false,
    ]);
  });

  it('adds robots noindex metadata only to noindex records', () => {
    const noindex = buildPageRecordMetadata(definePage(baseInput()));
    const indexed = buildPageRecordMetadata(
      definePage(baseInput({ status: 'indexed' }))
    );
    expect(noindex.robots).toEqual({ index: false, follow: true });
    expect(indexed.robots).toBeUndefined();
    expect(indexed.alternates?.canonical).toMatch(/\/solutions\/demo$/u);
    expect(indexed.openGraph?.title).toBe('Demo');
  });
});

describe('claim resolution', () => {
  it('resolves text and claim-backed copy from the registry', () => {
    const record = definePage(
      baseInput({
        copy: {
          'hero.eyebrow': { text: 'For demos' },
          'hero.proof': { claimRef: 'capability.demo.job' },
        },
      })
    );
    expect(resolvePageCopy(record, CLAIMS)).toEqual({
      'hero.eyebrow': 'For demos',
      'hero.proof': 'demo job statement',
    });
    expect(findUnresolvedRecordClaims(record, CLAIMS)).toEqual([]);
  });

  it('fails closed on a claim the registry lacks', () => {
    const record = definePage(
      baseInput({ copy: { 'hero.proof': { claimRef: 'capability.demo.job' } } })
    );
    expect(findUnresolvedRecordClaims(record, [])).toEqual([
      'capability.demo.job',
    ]);
    expect(() => resolvePageCopy(record, [])).toThrowError(
      /unknown claim capability\.demo\.job/u
    );
  });

  it('every shipped record claim and proof id resolves', () => {
    const claims = listProductTruthClaims();
    const proofIds = new Set(PROOF_REGISTRY.map(item => item.id));
    for (const record of SOLUTIONS_PAGE_RECORDS) {
      expect(findUnresolvedRecordClaims(record, claims)).toEqual([]);
      expect(() => resolvePageCopy(record, claims)).not.toThrow();
      expect(record.proof.filter(id => !proofIds.has(id))).toEqual([]);
    }
  });

  it('keeps record ids unique', () => {
    const ids = SOLUTIONS_PAGE_RECORDS.map(record => record.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain(solutionsArtistsPage.id);
  });
});
