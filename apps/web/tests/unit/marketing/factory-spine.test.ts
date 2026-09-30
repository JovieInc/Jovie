import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LANDING_STAGE_TO_FACTORY_STAGE, LANDING_STAGES } from '@jovie/copy';
import { describe, expect, it } from 'vitest';
import {
  FACTORY_RECEIPT_SCHEMA,
  FACTORY_STAGE_ARTIFACT_SCHEMA_IDS,
  FACTORY_STAGE_ARTIFACT_SCHEMAS,
  FACTORY_STAGE_ATTEMPT_LIMIT,
  FACTORY_STAGES,
  LANDING_PAGE_PIPELINE_STAGE_TO_FACTORY_STAGE,
  LANDING_PAGE_PIPELINE_STAGES,
  MARKETING_GENERATION_STAGE_TO_FACTORY_STAGE,
  MARKETING_GENERATION_STAGES,
  type StageReceipt,
  StageReceiptSchema,
  stageReceiptPassed,
} from '@/data/marketing';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = resolve(__dirname, '..', '..', '..');
const REPO_ROOT = resolve(WEB_ROOT, '..', '..');
const MARKETING_DATA_DIR = join(WEB_ROOT, 'data', 'marketing');
const COPY_PACKAGE_DIR = join(REPO_ROOT, 'packages', 'copy');

function listSourceFiles(dir: string): readonly string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return listSourceFiles(path);
    return entry.isFile() && entry.name.endsWith('.ts') ? [path] : [];
  });
}

function declaredStageEnums(dir: string): readonly string[] {
  return listSourceFiles(dir).flatMap(path =>
    Array.from(
      readFileSync(path, 'utf8').matchAll(/export const ([A-Z_]*STAGES)\b/g),
      match => match[1]
    )
  );
}

const receipt = (overrides: Record<string, unknown> = {}) => ({
  schema: FACTORY_RECEIPT_SCHEMA,
  pageId: 'artist-profiles',
  stage: 'copy',
  attempt: 1,
  inputDigest: 'sha256:input',
  outputDigest: 'sha256:output',
  producer: {
    modelId: 'copy-large',
    family: 'family-a',
    channel: 'router-primary',
  },
  evaluators: [
    {
      family: 'family-b',
      kind: 'rubric-judge',
      verdict: 'pass',
      score: 0.9,
      rubricVersion: 'copy-rubric-v3',
    },
  ],
  invariants: { passed: ['one-job-per-section'], failed: [] },
  ...overrides,
});

describe('factory spine', () => {
  it('defines the single canonical stage order', () => {
    expect(FACTORY_STAGES).toEqual([
      'truth',
      'outcomes',
      'narrative',
      'copy',
      'layout',
      'hero-variant',
      'proof',
      'gap-detection',
      'media-decision',
      'ref-sourcing',
      'asset',
      'render',
      'seo-agent',
      'adversarial-trust',
      'publish',
    ]);
  });

  it('fails if a fourth stage enum is introduced', () => {
    const enums = [
      ...declaredStageEnums(MARKETING_DATA_DIR),
      ...declaredStageEnums(COPY_PACKAGE_DIR),
    ];
    expect(new Set(enums)).toEqual(
      new Set([
        'FACTORY_STAGES',
        'MARKETING_GENERATION_STAGES',
        'LANDING_PAGE_PIPELINE_STAGES',
        'LANDING_STAGES',
      ])
    );
  });

  it('maps every legacy stage list onto canonical factory stages', () => {
    const maps = [
      [
        MARKETING_GENERATION_STAGES,
        MARKETING_GENERATION_STAGE_TO_FACTORY_STAGE,
      ],
      [
        LANDING_PAGE_PIPELINE_STAGES,
        LANDING_PAGE_PIPELINE_STAGE_TO_FACTORY_STAGE,
      ],
      [LANDING_STAGES, LANDING_STAGE_TO_FACTORY_STAGE],
    ] as const;

    for (const [stages, map] of maps) {
      expect(Object.keys(map).sort()).toEqual([...stages].sort());
      for (const stage of stages) {
        expect(FACTORY_STAGES).toContain(
          map[stage as keyof typeof map] as string
        );
      }
    }
  });

  it('declares a tagged artifact schema for every stage', () => {
    for (const stage of FACTORY_STAGES) {
      const schemaId = FACTORY_STAGE_ARTIFACT_SCHEMA_IDS[stage];
      expect(schemaId).toBe(`jovie.factory-artifact/${stage}/v1`);
      expect(
        FACTORY_STAGE_ARTIFACT_SCHEMAS[stage].safeParse({ schema: schemaId })
          .success
      ).toBe(true);
      expect(
        FACTORY_STAGE_ARTIFACT_SCHEMAS[stage].safeParse({
          schema: 'jovie.factory-artifact/other/v1',
        }).success
      ).toBe(false);
    }
  });

  it('validates a well-formed stage receipt', () => {
    const parsed = StageReceiptSchema.safeParse(receipt());
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(stageReceiptPassed(parsed.data)).toBe(true);
    }
  });

  it('bounds attempts to three', () => {
    expect(StageReceiptSchema.safeParse(receipt({ attempt: 4 })).success).toBe(
      false
    );
    expect(FACTORY_STAGE_ATTEMPT_LIMIT).toBe(3);
  });

  it('rejects an evaluator from the producer family', () => {
    const selfGraded = receipt({
      evaluators: [
        {
          family: 'family-a',
          kind: 'rubric-judge',
          verdict: 'pass',
          score: 1,
          rubricVersion: 'copy-rubric-v3',
        },
      ],
    });
    expect(StageReceiptSchema.safeParse(selfGraded).success).toBe(false);
  });

  it('rejects a producer-set passed flag; only the harness computes it', () => {
    expect(
      StageReceiptSchema.safeParse(receipt({ passed: true })).success
    ).toBe(false);

    const failing: StageReceipt = StageReceiptSchema.parse(
      receipt({
        evaluators: [
          {
            family: 'family-b',
            kind: 'rubric-judge',
            verdict: 'fail',
            score: 0.2,
            rubricVersion: 'copy-rubric-v3',
          },
        ],
      })
    );
    expect(stageReceiptPassed(failing)).toBe(false);

    const invariantFailure = StageReceiptSchema.parse(
      receipt({ invariants: { passed: [], failed: ['one-hero'] } })
    );
    expect(stageReceiptPassed(invariantFailure)).toBe(false);
  });
});
