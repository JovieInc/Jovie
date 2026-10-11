import { describe, expect, it } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';
import {
  getRoutedSolutionsPages,
  SOLUTIONS_PAGE_RECORDS,
} from '@/content/pages/solutions';
import { solutionsArtistsPage } from '@/content/pages/solutions/artists';
import { MARKETING_ROUTE_MANIFEST } from '@/data/marketing/routeManifest';
import { listProductTruthClaims } from '@/data/product-truth/claims';
import {
  getMarketingPageContractForPathname,
  MARKETING_PAGE_CONTRACTS,
} from '../pageContracts';
import { auditRecordHeroes, heroIntentForPathname } from './heroDecision';
import {
  definePage,
  findPageRecordTermViolations,
  MUSIC_ONLY_TERMS,
  type PageRecord,
  type PageRecordInput,
  PageRecordSchema,
  pageRecordPath,
  pageRecordTermPolicy,
  termPattern,
} from './pageRecord';
import {
  derivePageRecordContract,
  gatePageRecordCopy,
  getPageRecordContracts,
  getRoutedPageRecords,
  pageRecordPathsByFamilyUrl,
  resolveMarketingPageContract,
} from './pageRecordContract';

function foundersInput(
  overrides: Partial<PageRecordInput> = {},
  brief: Partial<PageRecordInput['brief']> = {}
): PageRecordInput {
  return {
    id: 'solutions.founders',
    family: 'solutions',
    slug: 'founders',
    status: 'noindex',
    brief: {
      audience: 'founders',
      job: 'show what founders are building and give people a clear next step',
      successEvent: 'founder claims a profile',
      ...brief,
    },
    claims: ['capability.demo.job'],
    composition: {
      recipeId: 'artist-lp',
      penContractId: 'DRJv9',
      sections: [{ renderer: 'artist-hero-adaptive-intro', sectionId: 'hero' }],
    },
    heroVariant: 'split-link-claim',
    seo: {
      title: 'For founders',
      description: 'Show what you are building. Give people a clear next step.',
      schema: ['SoftwareApplication'],
      hub: null,
      ogImage: '/og/default.png',
    },
    copy: {},
    trust: null,
    updatedAt: '2026-09-30',
    ...overrides,
  };
}

describe('per-record copy scope (JOV-7283)', () => {
  it('defaults an undeclared brief to shared scope', () => {
    const record = definePage(foundersInput());
    expect(record.brief.copyScope).toBe('shared');
    expect(pageRecordTermPolicy(record.brief).forbidden).toEqual(
      MUSIC_ONLY_TERMS
    );
  });

  it('fails a founders record that uses music-only terms', () => {
    const input = foundersInput({
      copy: { heroTitle: { text: 'Grow your fanbase on Spotify' } },
      seo: {
        ...foundersInput().seo,
        description: 'Share your latest songs with every listener.',
        keywords: ['music links'],
      },
    });
    const result = PageRecordSchema.safeParse(input);
    expect(result.success).toBe(false);
    const issues = result.success
      ? []
      : result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`);
    expect(issues).toEqual([
      'copy.heroTitle: "Spotify" is outside the shared copy scope',
      'copy.heroTitle: "fanbase" is outside the shared copy scope',
      'seo.description: "song" is outside the shared copy scope',
      'seo.description: "listener" is outside the shared copy scope',
      'seo.keywords.0: "music" is outside the shared copy scope',
    ]);
    expect(() => definePage(input)).toThrow(/outside the shared copy scope/u);
  });

  it('checks the brief job and FAQ, not only copy slots', () => {
    const input = foundersInput(
      {
        seo: {
          ...foundersInput().seo,
          faq: [{ question: 'Can I add tour dates?', answer: 'Yes.' }],
        },
      },
      { job: 'help founders pre-save a launch' }
    );
    expect(issuesFor(input)).toEqual([
      'brief.job: "pre-save"',
      'seo.faq.0.question: "tour dates"',
    ]);
  });

  it('lets a brief allow a named term and forbid extra ones', () => {
    expect(() =>
      definePage(
        foundersInput(
          { copy: { proof: { text: 'Connect Spotify next to LinkedIn.' } } },
          { allowedTerms: ['spotify'] }
        )
      )
    ).not.toThrow();
    expect(() =>
      definePage(
        foundersInput(
          { copy: { proof: { text: 'Find qualified leads.' } } },
          { forbiddenTerms: ['qualified lead'] }
        )
      )
    ).toThrow(/"qualified lead" is outside/u);
  });

  it('keeps the artists record in music scope', () => {
    expect(solutionsArtistsPage.brief.copyScope).toBe('music');
    expect(pageRecordTermPolicy(solutionsArtistsPage.brief).forbidden).toEqual(
      []
    );
    expect(findPageRecordTermViolations(solutionsArtistsPage)).toEqual([]);
    // The same record held to shared scope would fail on its music SEO copy.
    const asShared: PageRecord = {
      ...solutionsArtistsPage,
      brief: { ...solutionsArtistsPage.brief, copyScope: 'shared' },
    };
    expect(findPageRecordTermViolations(asShared).length).toBeGreaterThan(0);
  });

  it('matches whole words, plurals, and multi-word terms only', () => {
    expect(termPattern('fan').test('Fans hear first')).toBe(true);
    expect(termPattern('fan').test('a fantastic launch')).toBe(false);
    expect(termPattern('EP').test('a step forward')).toBe(false);
    expect(termPattern('tour dates').test('post tour\n dates')).toBe(true);
    expect(termPattern('music').test('music-first')).toBe(true);
  });
});

describe('per-record page contracts', () => {
  it('derives a contract for every routed record', () => {
    const records = getRoutedPageRecords();
    const contracts = getPageRecordContracts();
    expect(records.length).toBeGreaterThan(0);
    expect(contracts.map(c => c.recordId)).toEqual(records.map(r => r.id));
    for (const record of records) {
      const contract = resolveMarketingPageContract(pageRecordPath(record));
      expect(contract, record.id).toEqual(derivePageRecordContract(record));
      expect(contract?.copyScope).toBe(record.brief.copyScope);
      expect(contract?.job).toBe(record.brief.job);
      expect(contract?.successEvent).toBe(record.brief.successEvent);
    }
  });

  it('keeps the artists contract identical to the pre-record contract', () => {
    const contract = resolveMarketingPageContract(APP_ROUTES.SOLUTIONS_ARTISTS);
    expect(contract).toMatchObject({
      routeGlob: '(marketing)/solutions/[audience]/page.tsx',
      url: '/solutions/artists',
      copyScope: 'music',
      job: 'show artists how profiles connect music, links, and permissioned fan updates',
      proof: 'profile gallery, capture flow, and conversion sections',
      successEvent: 'artist claims a profile',
      primaryCta: { href: APP_ROUTES.SIGNUP, label: 'Claim your profile' },
      recordFamily: 'solutions',
      recordId: 'solutions.artists',
      audience: 'independent artists',
      heroVariant: 'split-link-claim',
      forbiddenTerms: [],
    });
  });

  it('makes the family glob a shared fallback that defers to records', () => {
    const glob =
      MARKETING_PAGE_CONTRACTS['(marketing)/solutions/[audience]/page.tsx'];
    expect(glob.recordFamily).toBe('solutions');
    expect(glob.copyScope).toBe('shared');
    expect(getMarketingPageContractForPathname('/solutions/founders')).toBe(
      glob
    );
    // No record, no contract: the glob never answers for a record path.
    expect(resolveMarketingPageContract('/solutions/founders')).toBeNull();
    expect(resolveMarketingPageContract(APP_ROUTES.PRICING)).toBe(
      MARKETING_PAGE_CONTRACTS['(marketing)/pricing/page.tsx']
    );
    expect(resolveMarketingPageContract(null)).toBeNull();
  });

  it('routes a noindex founders record through its own shared contract', () => {
    const founders = definePage(foundersInput());
    const records = [...SOLUTIONS_PAGE_RECORDS, founders];
    const contract = resolveMarketingPageContract(
      '/solutions/founders/',
      records
    );
    expect(contract?.copyScope).toBe('shared');
    expect(contract).toMatchObject({
      audience: 'founders',
      forbiddenTerms: MUSIC_ONLY_TERMS,
    });
    expect(pageRecordPathsByFamilyUrl(records).get('/solutions/*')).toEqual([
      '/solutions/artists',
      '/solutions/founders',
    ]);
  });

  it('covers every routed record from an active manifest family glob', () => {
    const familyUrls = [...pageRecordPathsByFamilyUrl().keys()];
    for (const url of familyUrls) {
      expect(
        MARKETING_ROUTE_MANIFEST.find(
          entry => entry.url === url && entry.status === 'active'
        ),
        url
      ).toBeDefined();
    }
  });
});

describe('record consumers', () => {
  it('passes the copy gate for every routed record', () => {
    const claims = listProductTruthClaims();
    for (const record of getRoutedSolutionsPages()) {
      const result = gatePageRecordCopy(record, claims);
      expect(result, record.id).toEqual({ ok: true, lint: [], scope: [] });
    }
  });

  it('fails the copy gate on scope and lint findings', () => {
    const record: PageRecord = {
      ...solutionsArtistsPage,
      brief: { ...solutionsArtistsPage.brief, copyScope: 'shared' },
      copy: { heroTitle: { text: 'Leverage your fans — today.' } },
    };
    const result = gatePageRecordCopy(record, listProductTruthClaims());
    expect(result.ok).toBe(false);
    expect(result.scope.length).toBeGreaterThan(0);
    expect(result.lint.length).toBeGreaterThan(0);
  });

  it('audits each record hero against the table for its own path', () => {
    const rows = auditRecordHeroes(
      getPageRecordContracts().map(({ url, heroVariant }) => ({
        url,
        heroVariant,
      }))
    );
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows)
      expect(row, row.url).toMatchObject({ mismatch: null });

    expect(heroIntentForPathname('/solutions/artists')?.url).toBe(
      '/solutions/*'
    );
    expect(heroIntentForPathname('/solutions/a/b')).toBeNull();
    expect(
      auditRecordHeroes([
        { url: '/solutions/founders', heroVariant: 'left-content' },
        { url: '/nowhere', heroVariant: 'left-content' },
      ]).map(row => row.mismatch)
    ).toEqual(['wrong-variant', 'unbound']);
  });
});

function issuesFor(input: PageRecordInput): string[] {
  const result = PageRecordSchema.safeParse(input);
  return result.success
    ? []
    : result.error.issues.map(
        i => `${i.path.join('.')}: ${i.message.split(' is outside')[0]}`
      );
}
