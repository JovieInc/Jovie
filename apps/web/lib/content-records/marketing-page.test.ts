import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MARKETING_SECTIONS } from '@/data/marketing/sections';
import { assignExperimentArm, experimentArmBody } from './experiment';
import { validateContentRecord } from './kind';
import {
  DEFAULT_HOME_SPEC,
  MARKETING_PAGE_KIND,
  MarketingPageSectionSchema,
  type MarketingPageSpec,
  SPEC_SECTION_REGISTRY,
} from './marketing-page';

const clone = <T>(value: T): T => structuredClone(value);

function cleanSpec(): MarketingPageSpec {
  const spec = clone(DEFAULT_HOME_SPEC);
  const hero = spec.sections[0];
  if (hero?.section !== 'hero') throw new Error('hero first');
  hero.copy.subhead =
    'A free profile for your work, bio, and links. Your latest release leads, with tour dates and updates one tap away.';
  return spec;
}

const validate = (data: unknown, key = 'home') =>
  validateContentRecord(MARKETING_PAGE_KIND, key, data);

const errorsOf = (data: unknown) => {
  const result = validate(data);
  return result.ok ? [] : result.errors;
};

describe('marketing-page content kind', () => {
  it('accepts a spec built from registered DS sections', () => {
    expect(validate(cleanSpec())).toEqual({ ok: true, data: cleanSpec() });
  });

  it('keeps the code default in sync with the rendered homepage order', () => {
    expect(DEFAULT_HOME_SPEC.sections.map(s => s.section)).toEqual([
      'hero',
      'product-gallery',
      'cta',
    ]);
  });

  it('flags audience language on the general homepage (MKT-D16)', () => {
    // The shipped default subhead still says "music"; the first publish
    // has to clear it, and no spec can reintroduce it.
    expect(errorsOf(DEFAULT_HOME_SPEC)).toEqual([
      expect.stringContaining('"music" is audience language'),
    ]);
  });

  it('rejects unknown records', () => {
    expect(errorsOf({ ...cleanSpec() }).length).toBe(0);
    expect(validate(cleanSpec(), 'pricing')).toEqual({
      ok: false,
      errors: ['Unknown marketing-page key: pricing'],
    });
  });

  it('has no slot for the locked headline', () => {
    const spec = cleanSpec() as unknown as {
      sections: { copy: Record<string, string> }[];
    };
    spec.sections[0]!.copy.headline = 'A new headline';
    expect(errorsOf(spec).join(' ')).toMatch(/headline/);
  });

  it('rejects variants and sections outside the renderer registry', () => {
    const spec = cleanSpec() as unknown as {
      sections: { variant: string; section: string }[];
    };
    spec.sections[0]!.variant = 'centered-phone';
    expect(errorsOf(spec).length).toBeGreaterThan(0);

    const unknown = cleanSpec() as unknown as { sections: unknown[] };
    unknown.sections.push({ section: 'logo-cloud', variant: 'inline-strip' });
    expect(errorsOf(unknown).length).toBeGreaterThan(0);
  });

  it('rejects prices typed into copy (same price everywhere)', () => {
    for (const text of ['Only $12 to start', 'Pro is 12 USD', 'Pay 9/mo']) {
      const spec = cleanSpec();
      const cta = spec.sections[2];
      if (cta?.section !== 'cta') throw new Error('cta last');
      cta.copy.subhead = text;
      expect(errorsOf(spec).join(' ')).toMatch(/offer truth/);
    }
  });

  it('enforces hero first, cta last, and one of each section', () => {
    const swapped = cleanSpec();
    swapped.sections.reverse();
    expect(errorsOf(swapped).join(' ')).toMatch(/hero section must come first/);

    const ctaMiddle = cleanSpec();
    const [hero, gallery, cta] = ctaMiddle.sections;
    ctaMiddle.sections = [hero!, cta!, gallery!];
    expect(errorsOf(ctaMiddle).join(' ')).toMatch(/closing cta must be last/);

    const duplicate = cleanSpec();
    duplicate.sections.splice(1, 0, clone(duplicate.sections[1]!));
    expect(errorsOf(duplicate).join(' ')).toMatch(/appears twice/);
  });

  it('rejects markup and multi-line copy', () => {
    const spec = cleanSpec();
    const gallery = spec.sections[1];
    if (gallery?.section !== 'product-gallery') throw new Error('gallery');
    gallery.copy.headline = 'Bold <b>claim</b>';
    expect(errorsOf(spec).join(' ')).toMatch(/Single line/);
  });

  it('validates experiment variants with the same rules as the control', () => {
    const spec = cleanSpec();
    const variantBody = clone(spec.sections);
    const gallery = variantBody[1];
    if (gallery?.section !== 'product-gallery') throw new Error('gallery');
    gallery.copy.headline = 'Every fan sees one clear thing.';
    spec.experiment = {
      id: 'home-gallery-headline',
      hypothesis: 'A sharper gallery headline lifts profile claims.',
      metric: { funnel: 'artist_signup', step: 'cta_click' },
      status: 'running',
      variants: [{ id: 'sharper', weight: 50, body: variantBody }],
    };
    expect(errorsOf(spec)).toEqual([
      expect.stringContaining(
        'experiment.variants[0].body[1].copy.headline: "fan"'
      ),
    ]);

    gallery.copy.headline = 'Your profile leads with the one thing that fits.';
    expect(errorsOf(spec)).toEqual([]);
  });

  it('rejects experiment weights over 100 and reserved or duplicate ids', () => {
    const spec = cleanSpec();
    const body = clone(spec.sections);
    spec.experiment = {
      id: 'too-much',
      hypothesis: 'Weights above one hundred are invalid.',
      metric: { funnel: 'artist_signup', step: 'claim_complete' },
      status: 'draft',
      variants: [
        { id: 'a', weight: 60, body },
        { id: 'a', weight: 50, body },
      ],
    };
    const errors = errorsOf(spec).join(' ');
    expect(errors).toMatch(/sum to 110/);
    expect(errors).toMatch(/Duplicate variant id/);

    spec.experiment.variants = [{ id: 'control', weight: 10, body }];
    expect(errorsOf(spec).join(' ')).toMatch(/reserved/);
  });

  it('only accepts conversion steps after landing_view as metrics', () => {
    const spec = cleanSpec() as unknown as Record<string, unknown>;
    spec.experiment = {
      id: 'bad-metric',
      hypothesis: 'Landing views are the denominator.',
      metric: { funnel: 'artist_signup', step: 'landing_view' },
      status: 'draft',
      variants: [{ id: 'b', weight: 10, body: cleanSpec().sections }],
    };
    expect(errorsOf(spec).length).toBeGreaterThan(0);
  });
});

describe('spec section registry', () => {
  it('binds every schema section to an existing, registered DS component', () => {
    const schemaPairs = MarketingPageSectionSchema.options.map(option => [
      option.shape.section.value,
      option.shape.variant.value,
    ]);
    expect(
      SPEC_SECTION_REGISTRY.map(entry => [entry.section, entry.variant])
    ).toEqual(schemaPairs);
    for (const entry of SPEC_SECTION_REGISTRY) {
      const section = MARKETING_SECTIONS.find(s => s.id === entry.section);
      expect(section?.variants.map(v => v.id)).toContain(entry.variant);
      const source = readFileSync(
        resolve(process.cwd(), '../..', entry.source),
        'utf8'
      );
      expect(source).toContain(`export function ${entry.component}(`);
    }
  });

  it('marks homepage sections migrating while the census holds them out', () => {
    // surfaceCensus `home` is a holdout (JOV-8101); flip with the census.
    expect(new Set(SPEC_SECTION_REGISTRY.map(e => e.dsStatus))).toEqual(
      new Set(['migrating'])
    );
  });
});

describe('experiment assignment', () => {
  const experiment = {
    id: 'home-test',
    status: 'running' as const,
    variants: [
      { id: 'a', weight: 25, body: 'A' },
      { id: 'b', weight: 25, body: 'B' },
    ],
  };

  it('is deterministic per visitor', () => {
    const first = assignExperimentArm(experiment, 'visitor-1');
    for (let i = 0; i < 5; i++) {
      expect(assignExperimentArm(experiment, 'visitor-1')).toBe(first);
    }
  });

  it('splits traffic close to the declared weights', () => {
    const counts: Record<string, number> = { a: 0, b: 0, control: 0 };
    for (let i = 0; i < 20_000; i++) {
      const arm = assignExperimentArm(experiment, `visitor-${i}`);
      counts[arm] = (counts[arm] ?? 0) + 1;
    }
    expect(counts.a! / 20_000).toBeGreaterThan(0.22);
    expect(counts.a! / 20_000).toBeLessThan(0.28);
    expect(counts.b! / 20_000).toBeGreaterThan(0.22);
    expect(counts.control! / 20_000).toBeGreaterThan(0.46);
  });

  it('serves control unless the experiment is running', () => {
    expect(
      assignExperimentArm({ ...experiment, status: 'stopped' }, 'visitor-1')
    ).toBe('control');
    expect(assignExperimentArm(undefined, 'visitor-1')).toBe('control');
  });

  it('resolves arm bodies with control as the fallback', () => {
    expect(experimentArmBody('C', experiment, 'b')).toBe('B');
    expect(experimentArmBody('C', experiment, 'control')).toBe('C');
    expect(experimentArmBody('C', experiment, 'missing')).toBe('C');
    expect(experimentArmBody('C', undefined, 'a')).toBe('C');
  });
});
