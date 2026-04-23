import { describe, expect, it } from 'vitest';
import {
  compileRule,
  parseApplicabilityRule,
  type ReleaseContext,
} from '@/lib/release-tasks/applicability';
import {
  type CatalogRow,
  explainSelection,
  selectTasks,
} from '@/lib/release-tasks/select-tasks';

const catalogRow = (
  overrides: Partial<CatalogRow> &
    Pick<CatalogRow, 'slug' | 'applicabilityRules'>
): CatalogRow => ({
  name: overrides.slug,
  category: 'test',
  clusterId: null,
  shortDescription: null,
  priority: 'medium',
  flowStageDaysOffset: null,
  aiSkillStatus: 'none',
  aiSkillId: null,
  assigneeType: 'human',
  catalogVersion: 1,
  ...overrides,
});

// Minimal catalog with characteristic rules — enough to exercise the selector
// across real archetypes without seeding the whole ~30-row catalog.
const FIXTURE_CATALOG: CatalogRow[] = [
  catalogRow({
    slug: 'pro-work-registration',
    priority: 'high',
    applicabilityRules: { type: 'always' },
  }),
  catalogRow({
    slug: 'soundexchange-registration',
    priority: 'high',
    applicabilityRules: {
      type: 'hasPublisher',
      value: false,
    },
  }),
  catalogRow({
    slug: 'nacc-college-radio',
    priority: 'medium',
    applicabilityRules: {
      type: 'and',
      rules: [
        { type: 'territory', op: 'includes', values: ['US'] },
        {
          type: 'genre',
          op: 'not_in',
          values: ['electronic'],
        },
      ],
    },
  }),
  catalogRow({
    slug: 'proximity-youtube-network',
    priority: 'medium',
    applicabilityRules: {
      type: 'genre',
      op: 'in',
      values: ['electronic'],
    },
  }),
  catalogRow({
    slug: 'cloudkid-youtube-network',
    priority: 'medium',
    applicabilityRules: {
      type: 'genre',
      op: 'in',
      values: ['electronic'],
    },
  }),
  catalogRow({
    slug: 'dj-promo-pool-bpm-supreme',
    priority: 'medium',
    applicabilityRules: {
      type: 'genre',
      op: 'in',
      values: ['electronic', 'hiphop'],
    },
  }),
  catalogRow({
    slug: 'allmusic-submission',
    priority: 'medium',
    applicabilityRules: {
      type: 'distribution',
      op: 'neq',
      value: 'diy',
    },
  }),
  catalogRow({
    slug: 'remix-contest',
    priority: 'low',
    applicabilityRules: {
      type: 'genre',
      op: 'in',
      values: ['electronic'],
    },
  }),
];

const ctx = (overrides: Partial<ReleaseContext>): ReleaseContext => ({
  genre: 'electronic',
  distribution: 'diy',
  territory: ['GLOBAL'],
  hasPublisher: false,
  releaseFormat: 'single',
  primaryGoal: 'streams',
  ...overrides,
});

describe('selectTasks', () => {
  it('electronic-DIY-global includes Proximity/CloudKid/DJ-pool, omits NACC', () => {
    const picked = selectTasks(
      ctx({ genre: 'electronic', distribution: 'diy', territory: ['GLOBAL'] }),
      FIXTURE_CATALOG
    ).map(r => r.slug);

    expect(picked).toContain('proximity-youtube-network');
    expect(picked).toContain('cloudkid-youtube-network');
    expect(picked).toContain('dj-promo-pool-bpm-supreme');
    expect(picked).not.toContain('nacc-college-radio');
  });

  it('country-indie_label-US includes NACC + AllMusic, omits YouTube/remix-contest', () => {
    const picked = selectTasks(
      ctx({
        genre: 'country',
        distribution: 'indie_label',
        territory: ['US'],
      }),
      FIXTURE_CATALOG
    ).map(r => r.slug);

    expect(picked).toContain('nacc-college-radio');
    expect(picked).toContain('allmusic-submission');
    expect(picked).not.toContain('proximity-youtube-network');
    expect(picked).not.toContain('cloudkid-youtube-network');
    expect(picked).not.toContain('remix-contest');
  });

  it('universal "always" rules are included for every archetype', () => {
    for (const c of [
      ctx({ genre: 'pop', distribution: 'major_label' }),
      ctx({ genre: 'classical', distribution: 'diy', territory: ['EU'] }),
      ctx({ genre: 'hiphop', distribution: 'indie_label' }),
    ]) {
      const picked = selectTasks(c, FIXTURE_CATALOG).map(r => r.slug);
      expect(picked).toContain('pro-work-registration');
    }
  });

  it('soundexchange excluded when artist has a publisher', () => {
    const withPub = selectTasks(
      ctx({ hasPublisher: true }),
      FIXTURE_CATALOG
    ).map(r => r.slug);
    const withoutPub = selectTasks(
      ctx({ hasPublisher: false }),
      FIXTURE_CATALOG
    ).map(r => r.slug);
    expect(withPub).not.toContain('soundexchange-registration');
    expect(withoutPub).toContain('soundexchange-registration');
  });

  it('ordering is stable and score-descending', () => {
    const a = selectTasks(ctx({}), FIXTURE_CATALOG);
    const b = selectTasks(ctx({}), FIXTURE_CATALOG);
    expect(a.map(r => r.slug)).toEqual(b.map(r => r.slug));
    for (let i = 1; i < a.length; i++) {
      expect(a[i - 1]!.score).toBeGreaterThanOrEqual(a[i]!.score);
    }
  });

  it('allmusic-submission excluded for DIY artists', () => {
    const diy = selectTasks(ctx({ distribution: 'diy' }), FIXTURE_CATALOG).map(
      r => r.slug
    );
    const label = selectTasks(
      ctx({ distribution: 'major_label' }),
      FIXTURE_CATALOG
    ).map(r => r.slug);
    expect(diy).not.toContain('allmusic-submission');
    expect(label).toContain('allmusic-submission');
  });
});

describe('explainSelection', () => {
  it('returns an entry per catalog row with reason trace', () => {
    const report = explainSelection(
      ctx({ genre: 'country', territory: ['US'], distribution: 'indie_label' }),
      FIXTURE_CATALOG
    );
    expect(report.length).toBe(FIXTURE_CATALOG.length);
    const nacc = report.find(r => r.slug === 'nacc-college-radio');
    expect(nacc?.matched).toBe(true);
    expect(nacc?.reasons.join(' ')).toMatch(/territory/);
  });
});

describe('compileRule / parseApplicabilityRule', () => {
  it('rejects malformed predicates', () => {
    expect(() => parseApplicabilityRule({ type: 'bogus' })).toThrow();
    expect(() =>
      parseApplicabilityRule({ type: 'genre', op: 'in', values: [] })
    ).toThrow();
  });

  it('and/or/not compose correctly', () => {
    const c = ctx({ genre: 'electronic', territory: ['US'] });
    const compile = (p: Parameters<typeof compileRule>[0]) =>
      compileRule(p)(c).matched;

    expect(
      compile({
        type: 'and',
        rules: [
          { type: 'genre', op: 'in', values: ['electronic'] },
          { type: 'territory', op: 'includes', values: ['US'] },
        ],
      })
    ).toBe(true);

    expect(
      compile({
        type: 'or',
        rules: [
          { type: 'genre', op: 'in', values: ['country'] },
          { type: 'territory', op: 'includes', values: ['US'] },
        ],
      })
    ).toBe(true);

    expect(
      compile({
        type: 'not',
        rule: { type: 'genre', op: 'in', values: ['country'] },
      })
    ).toBe(true);
  });
});
