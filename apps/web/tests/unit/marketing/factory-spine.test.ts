import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LANDING_STAGES } from '@jovie/copy';
import { describe, expect, it } from 'vitest';
import type { StageReceipt } from '@/data/marketing';
import {
  applyStagePassedBit,
  COPY_LANDING_STAGE_TO_FACTORY,
  FACTORY_CERTIFIER_HARNESS,
  FACTORY_STAGE_ARTIFACT_SCHEMAS,
  FACTORY_STAGES,
  LANDING_PAGE_PIPELINE_STAGE_TO_FACTORY,
  LANDING_PAGE_PIPELINE_STAGES,
  MARKETING_GENERATION_STAGE_TO_FACTORY,
  MARKETING_GENERATION_STAGES,
  StageReceiptSchema,
  validateStageReceipt,
} from '@/data/marketing';

const repoRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../..'
);

const digest = (char: string) => `sha256:${char.repeat(64)}`;

function receipt(overrides: Partial<StageReceipt> = {}): StageReceipt {
  return {
    schema: 'jovie.factory-receipt/v1',
    pageId: 'solutions-artists',
    stage: 'copy',
    attempt: 1,
    inputDigest: digest('a'),
    outputDigest: digest('b'),
    producer: {
      modelId: 'anthropic/claude-opus-5-5',
      family: 'anthropic',
      channel: 'subscription-cli',
    },
    evaluators: [
      {
        id: 'copy-judge-gpt',
        family: 'openai',
        kind: 'llm',
        verdict: 'pass',
        score: 0.9,
        rubricVersion: 'copy-rubric/1',
      },
    ],
    invariantsPassed: ['copy-lint'],
    invariantsFailed: [],
    certifier: FACTORY_CERTIFIER_HARNESS,
    passed: true,
    at: '2026-09-29T12:00:00.000Z',
    ...overrides,
  };
}

function unpassed(
  overrides: Partial<StageReceipt> = {}
): Omit<StageReceipt, 'passed' | 'certifier'> {
  const {
    passed: _passed,
    certifier: _certifier,
    ...rest
  } = receipt(overrides);
  return rest;
}

describe('factory stage spine', () => {
  it('orders the stages exactly as the plan', () => {
    expect(FACTORY_STAGES).toEqual([
      'truth',
      'persuasion',
      'outcomes',
      'narrative',
      'layout',
      'hero-variant',
      'proof',
      'gap-detection',
      'copy',
      'media-decision',
      'ref-sourcing',
      'asset',
      'render',
      'seo-agent',
      'adversarial-trust',
      'publish',
    ]);
    expect(Object.keys(FACTORY_STAGE_ARTIFACT_SCHEMAS).sort()).toEqual(
      [...FACTORY_STAGES].sort()
    );
  });

  it.each([
    [
      'generation',
      MARKETING_GENERATION_STAGES,
      MARKETING_GENERATION_STAGE_TO_FACTORY,
    ],
    [
      'landing grammar',
      LANDING_PAGE_PIPELINE_STAGES,
      LANDING_PAGE_PIPELINE_STAGE_TO_FACTORY,
    ],
    ['@jovie/copy', LANDING_STAGES, COPY_LANDING_STAGE_TO_FACTORY],
  ] as const)(
    'maps every %s stage onto a spine stage',
    (_name, stages, mapping) => {
      expect(Object.keys(mapping).sort()).toEqual([...stages].sort());
      for (const target of Object.values(mapping)) {
        expect(FACTORY_STAGES).toContain(target);
      }
    }
  );

  it('requires the structural plan before copy regardless of legacy alias order', () => {
    const copy = FACTORY_STAGES.indexOf(
      MARKETING_GENERATION_STAGE_TO_FACTORY.copy
    );
    for (const stage of ['layout', 'proof', 'gap-detection'] as const) {
      expect(FACTORY_STAGES.indexOf(stage)).toBeLessThan(copy);
    }
  });

  it('fails when a new marketing stage list appears outside the spine', () => {
    const allowed = new Set([
      'apps/web/data/marketing/factory/spine.ts:FACTORY_STAGES',
      'apps/web/data/marketing/generation.ts:MARKETING_GENERATION_STAGES',
      'apps/web/data/marketing/landingPageGrammar.ts:LANDING_PAGE_PIPELINE_STAGES',
      'packages/copy/landing.ts:LANDING_STAGES',
    ]);
    const roots = ['apps/web/data/marketing', 'packages/copy'];
    const found: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        if (name === 'node_modules') continue;
        const path = join(dir, name);
        if (statSync(path).isDirectory()) {
          walk(path);
          continue;
        }
        if (!/\.(ts|tsx|mjs|js)$/.test(name) || /\.test\./.test(name)) continue;
        const source = readFileSync(path, 'utf8');
        for (const match of source.matchAll(
          /\bconst\s+([A-Z][A-Z0-9_]*STAGES)\s*(?::[^=]+)?=\s*\[/g
        )) {
          found.push(`${relative(repoRoot, path)}:${match[1]}`);
        }
      }
    };
    for (const root of roots) walk(join(repoRoot, root));

    expect(found.filter(entry => !allowed.has(entry))).toEqual([]);
    expect(found.sort()).toEqual([...allowed].sort());
  });
});

describe('stage artifact schemas', () => {
  it('rejects copy with em dashes or untagged claims', () => {
    const schema = FACTORY_STAGE_ARTIFACT_SCHEMAS.copy;
    const slot = {
      sectionInstanceId: 'hero',
      slot: 'headline',
      text: 'Your music, one link.',
      claimIds: ['claim-smart-link'],
    };
    expect(schema.safeParse({ pageId: 'p', slots: [slot] }).success).toBe(true);
    expect(
      schema.safeParse({
        pageId: 'p',
        slots: [{ ...slot, text: 'One link — everywhere.' }],
      }).success
    ).toBe(false);
    expect(
      schema.safeParse({ pageId: 'p', slots: [{ ...slot, claimIds: [] }] })
        .success
    ).toBe(false);
    expect(
      schema.safeParse({
        pageId: 'p',
        slots: [{ ...slot, claimIds: [], nonClaim: true }],
      }).success
    ).toBe(true);
  });

  it('requires three unique data points in the outcome brief', () => {
    const base = {
      pageId: 'p',
      brief: {
        businessObjective: 'Get artists to claim a handle',
        targetAudience: 'artist',
        desiredConversion: 'claim-handle',
        intent: 'category',
      },
      icp: 'independent artist',
      jobsToBeDone: ['share every release from one link'],
      outcomes: [{ id: 'o1', statement: 'One link', claimIds: ['c1'] }],
    };
    const point = (statement: string) => ({ statement, sourceRef: 'src-1' });
    const schema = FACTORY_STAGE_ARTIFACT_SCHEMAS.outcomes;
    expect(
      schema.safeParse({
        ...base,
        dataPoints: [point('a'), point('b'), point('c')],
      }).success
    ).toBe(true);
    expect(
      schema.safeParse({
        ...base,
        dataPoints: [point('a'), point('a'), point('c')],
      }).success
    ).toBe(false);
    expect(
      schema.safeParse({ ...base, dataPoints: [point('a'), point('b')] })
        .success
    ).toBe(false);
  });

  it('only accepts locked hero variants and the locked header', () => {
    const schema = FACTORY_STAGE_ARTIFACT_SCHEMAS['hero-variant'];
    const choice = {
      pageId: 'p',
      variantId: 'xm2iz',
      headerId: 'eoUUU',
      headerState: 'docked',
    };
    expect(schema.safeParse(choice).success).toBe(true);
    expect(schema.safeParse({ ...choice, variantId: 'qENyP' }).success).toBe(
      false
    );
    expect(schema.safeParse({ ...choice, headerId: 'other' }).success).toBe(
      false
    );
  });

  it('bounds SEO sibling links to three to five', () => {
    const schema = FACTORY_STAGE_ARTIFACT_SCHEMAS['seo-agent'];
    const seo = {
      pageId: 'p',
      canonical: 'https://jov.ie/solutions/artists',
      title: 'Artists',
      description: 'For artists',
      jsonLdTypes: ['WebPage'],
      siblingLinks: ['/a', '/b', '/c'],
      llmsEntry: true,
    };
    expect(schema.safeParse(seo).success).toBe(true);
    expect(
      schema.safeParse({ ...seo, siblingLinks: ['/a', '/b'] }).success
    ).toBe(false);
  });
});

describe('stage receipts', () => {
  it('accepts a cross-family harness-certified receipt', () => {
    expect(StageReceiptSchema.safeParse(receipt()).success).toBe(true);
    expect(validateStageReceipt(receipt())).toEqual([]);
  });

  it('rejects malformed receipts and attempts beyond three', () => {
    expect(validateStageReceipt(receipt({ attempt: 4 }))[0]).toMatch(
      /^attempt:/
    );
    expect(validateStageReceipt({ schema: 'other' }).length).toBeGreaterThan(0);
  });

  it('rejects same-family llm and vision evaluators', () => {
    for (const kind of ['llm', 'vision'] as const) {
      const issues = validateStageReceipt(
        receipt({
          evaluators: [
            {
              id: 'self-judge',
              family: 'anthropic',
              kind,
              verdict: 'pass',
              score: 1,
              rubricVersion: 'r/1',
            },
          ],
        })
      );
      expect(issues).toContain(
        'evaluator self-judge shares family anthropic with the producer'
      );
    }
  });

  it('allows same-family deterministic evaluators and producerless stages', () => {
    const deterministic = receipt({
      evaluators: [
        {
          id: 'copy-lint',
          family: 'anthropic',
          kind: 'deterministic',
          verdict: 'pass',
          score: 1,
          rubricVersion: 'lint/1',
        },
      ],
    });
    expect(validateStageReceipt(deterministic)).toEqual([]);
    expect(
      validateStageReceipt(receipt({ producer: null, stage: 'truth' }))
    ).toEqual([]);
  });

  it('rejects passed receipts not set by the harness or with failures', () => {
    expect(validateStageReceipt(receipt({ certifier: 'jev' }))).toContain(
      'only the harness may set passed, got jev'
    );
    expect(
      validateStageReceipt(receipt({ invariantsFailed: ['em-dash'] }))
    ).toContain('passed receipt cannot list failed invariants');
    const revise = receipt().evaluators.map(e => ({
      ...e,
      verdict: 'revise' as const,
    }));
    expect(validateStageReceipt(receipt({ evaluators: revise }))).toContain(
      'passed receipt needs a pass verdict from every evaluator'
    );
    expect(
      validateStageReceipt(receipt({ certifier: 'jev', passed: false }))
    ).toEqual([]);
  });

  it('lets only the harness mark a receipt passed', () => {
    expect(
      applyStagePassedBit(unpassed(), { certifier: 'harness' }).passed
    ).toBe(true);
    expect(applyStagePassedBit(unpassed(), { certifier: 'jev' }).passed).toBe(
      false
    );
    expect(
      applyStagePassedBit(unpassed({ invariantsFailed: ['cls'] }), {
        certifier: 'harness',
      }).passed
    ).toBe(false);
    const selfJudged = unpassed({
      evaluators: [
        {
          id: 'self',
          family: 'anthropic',
          kind: 'vision',
          verdict: 'pass',
          score: 1,
          rubricVersion: 'r/1',
        },
      ],
    });
    expect(
      applyStagePassedBit(selfJudged, { certifier: 'harness' }).passed
    ).toBe(false);
  });
});
