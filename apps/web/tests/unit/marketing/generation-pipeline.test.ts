import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type {
  MarketingGateReceipt,
  MarketingModelCandidate,
  MarketingNarrativePlan,
} from '@/data/marketing';
import {
  auditJovieImageColorDecision,
  auditMarketingNarrativePlan,
  auditMarketingTasteAdmission,
  formatJovieImageColorPolicyForPrompt,
  isForbiddenControllableSceneColor,
  JOVIE_IMAGE_COLOR_POLICY,
  MARKETING_ASSET_GENERATION_COLOR_CONTRACT,
  MARKETING_GENERATION_STAGES,
  MARKETING_STAGE_ATTEMPT_LIMITS,
  MARKETING_TASTE_GATE_IDS,
  MARKETING_VISUAL_REVIEW_COLOR_CONTRACT,
  resolveJovieSceneColorRole,
  selectMarketingModelCandidate,
} from '@/data/marketing';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = resolve(__dirname, '..', '..', '..');
const REPO_ROOT = resolve(WEB_ROOT, '..', '..');

const candidates: readonly MarketingModelCandidate[] = [
  {
    id: 'cheap-copy',
    provider: 'provider-a',
    model: 'copy-small',
    healthy: true,
    capabilities: ['structured-output', 'editorial-compression'],
    roleScores: { 'copy-compiler': 0.8 },
    tasteAcceptanceRate: 0.75,
    costRank: 1,
    latencyRank: 1,
  },
  {
    id: 'best-copy',
    provider: 'provider-b',
    model: 'copy-large',
    healthy: true,
    capabilities: ['structured-output', 'editorial-compression'],
    roleScores: { 'copy-compiler': 0.96 },
    tasteAcceptanceRate: 0.9,
    costRank: 3,
    latencyRank: 3,
  },
  {
    id: 'unhealthy-copy',
    provider: 'provider-c',
    model: 'copy-offline',
    healthy: false,
    capabilities: ['structured-output', 'editorial-compression'],
    roleScores: { 'copy-compiler': 1 },
    tasteAcceptanceRate: 1,
    costRank: 1,
    latencyRank: 1,
  },
];

const narrative = (overrides: Partial<MarketingNarrativePlan> = {}) => ({
  pageId: 'artist-profiles',
  sections: [
    {
      sectionInstanceId: 'hero-0',
      sectionId: 'hero',
      question: 'Why is this different?',
      sectionJob: 'Define the category promise.',
      primaryResponsibility: 'adaptation',
      newInformation: 'One profile can prioritize a different action.',
      customerBelief: 'This is not a static link page.',
      evidenceRefs: ['profile-live', 'profile-tour'],
      mustNotRepeat: ['adaptation'],
    },
    {
      sectionInstanceId: 'feature-grid-0',
      sectionId: 'feature-grid',
      question: 'What can the profile hold?',
      sectionJob: 'Show the product scope.',
      primaryResponsibility: 'content coverage',
      newInformation: 'Music, shows, support, and contact live together.',
      customerBelief: 'This is a real artist destination.',
      evidenceRefs: ['profile-live'],
      mustNotRepeat: ['adaptation'],
    },
  ],
  ...overrides,
});

const ionScene = { lightness: 72, chroma: 0.14, hue: 240 } as const;
const ultraScene = { lightness: 70, chroma: 0.15, hue: 296 } as const;
const pulseScene = { lightness: 71, chroma: 0.19, hue: 340 } as const;
const graphiteNeutral = { lightness: 12, chroma: 0.02, hue: 80 } as const;
const saturatedGreen = { lightness: 64, chroma: 0.18, hue: 145 } as const;
const saturatedRed = { lightness: 60, chroma: 0.18, hue: 20 } as const;

function codes(
  findings: ReturnType<typeof auditJovieImageColorDecision>
): readonly string[] {
  return findings.map(finding => finding.code);
}

function readRepoSource(relativePath: string): string {
  return readFileSync(resolve(REPO_ROOT, relativePath), 'utf8');
}

describe('marketing generation pipeline', () => {
  it('keeps the closed-loop stage order stable and repair budgets bounded', () => {
    expect(MARKETING_GENERATION_STAGES).toEqual([
      'truth',
      'narrative',
      'copy',
      'section-design',
      'asset-generation',
      'adversarial-review',
      'taste-admission',
    ]);
    expect(Math.max(...Object.values(MARKETING_STAGE_ATTEMPT_LIMITS))).toBe(3);
    expect(MARKETING_STAGE_ATTEMPT_LIMITS.truth).toBe(1);
    expect(MARKETING_STAGE_ATTEMPT_LIMITS['taste-admission']).toBe(1);
  });

  it('routes by capability and role quality rather than a hardcoded model name', () => {
    expect(
      selectMarketingModelCandidate({
        role: 'copy-compiler',
        candidates,
      })?.id
    ).toBe('best-copy');

    expect(
      selectMarketingModelCandidate({
        role: 'copy-compiler',
        candidates,
        excludedModelIds: ['best-copy'],
      })?.id
    ).toBe('cheap-copy');

    expect(
      selectMarketingModelCandidate({
        role: 'adversarial-reviewer',
        candidates,
      })
    ).toBeNull();
  });

  it('rejects repeated narrative responsibilities before copy begins', () => {
    const repeated = narrative({
      sections: [
        ...narrative().sections,
        {
          sectionInstanceId: 'comparison-0',
          sectionId: 'comparison',
          question: 'How does the profile adapt?',
          sectionJob: 'Explain the same mechanism again.',
          primaryResponsibility: 'adaptation',
          newInformation: 'A different fan sees a different action.',
          customerBelief: 'The profile changes with context.',
          evidenceRefs: ['profile-tour'],
          mustNotRepeat: ['adaptation'],
        },
      ],
    });

    expect(
      auditMarketingNarrativePlan(repeated).map(finding => finding.code)
    ).toContain('duplicate-primary-responsibility');
    expect(auditMarketingNarrativePlan(narrative())).toEqual([]);
  });

  it('admits one digest-bound survivor only after all ten gates pass', () => {
    const receipts: readonly MarketingGateReceipt[] =
      MARKETING_TASTE_GATE_IDS.map(gateId => ({
        gateId,
        verdict: 'pass',
        executionId: `execution-${gateId}`,
        candidateDigest: 'digest-a',
        reviewerModelId:
          gateId === 'visual-review' ? 'vision-reviewer' : undefined,
        findings: [],
      }));

    expect(
      auditMarketingTasteAdmission({
        candidateDigest: 'digest-a',
        generatorModelId: 'image-generator',
        receipts,
      })
    ).toEqual([]);

    expect(
      auditMarketingTasteAdmission({
        candidateDigest: 'digest-b',
        generatorModelId: 'vision-reviewer',
        receipts,
      }).map(finding => finding.code)
    ).toEqual(
      expect.arrayContaining(['stale-gate-receipt', 'self-reviewed-visual'])
    );
  });

  it('canonizes Scene Palette v1 without changing production UI anchors', () => {
    expect(JOVIE_IMAGE_COLOR_POLICY.schema).toBe('jovie-image-color-policy/v1');
    expect(JOVIE_IMAGE_COLOR_POLICY.version).toBe('scene-palette-v1');
    expect(JOVIE_IMAGE_COLOR_POLICY.invariant).toBe(
      'The camera must find the palette.'
    );
    expect(
      JOVIE_IMAGE_COLOR_POLICY.scenePalette.map(entry => ({
        role: entry.role,
        ui: entry.uiAnchor.hex,
        scene: entry.sceneReference.hex,
        oklch: entry.sceneReference.oklch,
        corridor: entry.hueCorridor,
        plausibility: entry.plausibility,
      }))
    ).toEqual([
      {
        role: 'ion',
        ui: '#11AFFF',
        scene: '#3FAFF3',
        oklch: 'oklch(72% 0.14 240)',
        corridor: { minHue: 220, maxHue: 258 },
        plausibility: {
          lightnessRange: { min: 45, max: 82 },
          chromaRange: { min: 0.06, max: 0.18 },
        },
      },
      {
        role: 'ultra',
        ui: '#A982FF',
        scene: '#A789F0',
        oklch: 'oklch(70% 0.15 296)',
        corridor: { minHue: 276, maxHue: 314 },
        plausibility: {
          lightnessRange: { min: 42, max: 78 },
          chromaRange: { min: 0.06, max: 0.18 },
        },
      },
      {
        role: 'pulse',
        ui: '#FF48D2',
        scene: '#EB6AC6',
        oklch: 'oklch(71% 0.19 340)',
        corridor: { minHue: 322, maxHue: 358 },
        plausibility: {
          lightnessRange: { min: 45, max: 80 },
          chromaRange: { min: 0.08, max: 0.22 },
        },
      },
    ]);
    expect(JOVIE_IMAGE_COLOR_POLICY.neutralRule.maxChroma).toBe(0.04);
    expect(JOVIE_IMAGE_COLOR_POLICY.protectedClasses).toEqual(
      expect.arrayContaining([
        'human-biology',
        'safety-color',
        'trademark-color',
        'creator-owned-identity',
        'product-screenshot',
      ])
    );
    expect(JOVIE_IMAGE_COLOR_POLICY.failureActions).not.toContain(
      'post-hoc-recolor'
    );
  });

  it('embeds the same color policy into asset generation and visual review', () => {
    const promptBlock = formatJovieImageColorPolicyForPrompt();

    expect(MARKETING_ASSET_GENERATION_COLOR_CONTRACT.policySchema).toBe(
      JOVIE_IMAGE_COLOR_POLICY.schema
    );
    expect(MARKETING_VISUAL_REVIEW_COLOR_CONTRACT.policyVersion).toBe(
      JOVIE_IMAGE_COLOR_POLICY.version
    );
    expect(MARKETING_ASSET_GENERATION_COLOR_CONTRACT.promptBlock).toBe(
      promptBlock
    );
    expect(MARKETING_VISUAL_REVIEW_COLOR_CONTRACT.promptBlock).toBe(
      promptBlock
    );
    expect(promptBlock).toContain('The camera must find the palette.');
    expect(promptBlock).toContain('Ion');
    expect(promptBlock).toContain('#3FAFF3');
    expect(promptBlock).toContain('Protected truth');
    expect(promptBlock).toContain('Never fix with post-hoc recoloring');
  });

  it('allows controllable scene colors only when they are scene hues or neutral', () => {
    expect(resolveJovieSceneColorRole(ionScene)).toBe('ion');
    expect(resolveJovieSceneColorRole(ultraScene)).toBe('ultra');
    expect(resolveJovieSceneColorRole(pulseScene)).toBe('pulse');
    expect(resolveJovieSceneColorRole(graphiteNeutral)).toBe('neutral');
    expect(isForbiddenControllableSceneColor(saturatedGreen)).toBe(true);
    expect(
      resolveJovieSceneColorRole({ lightness: 90, chroma: 0.2, hue: 240 })
    ).toBeNull();

    expect(
      auditJovieImageColorDecision({
        control: 'controllable-scene',
        subject: 'studio jacket',
        salience: 'high',
        color: ionScene,
      })
    ).toEqual([]);
    expect(
      auditJovieImageColorDecision({
        control: 'controllable-scene',
        subject: 'graphite couch',
        salience: 'high',
        color: graphiteNeutral,
      })
    ).toEqual([]);
    expect(
      codes(
        auditJovieImageColorDecision({
          control: 'controllable-scene',
          subject: 'decorative green couch',
          salience: 'high',
          color: saturatedGreen,
        })
      )
    ).toContain('forbidden-controllable-scene-color');
  });

  it('keeps protected real-world color truthful and rejects recolored conflicts', () => {
    expect(
      auditJovieImageColorDecision({
        control: 'protected-truth',
        subject: 'subordinate red fire hydrant',
        protectedClass: 'safety-color',
        salience: 'low',
        color: saturatedRed,
        requestedAction: 'truthful-source',
      })
    ).toEqual([]);

    expect(
      codes(
        auditJovieImageColorDecision({
          control: 'protected-truth',
          subject: 'red post box recolored blue',
          protectedClass: 'cultural-color',
          salience: 'high',
          color: saturatedRed,
          requestedAction: 'post-hoc-recolor',
        })
      )
    ).toContain('protected-color-falsified');
  });

  it('rejects reflection colors without a matching physical source', () => {
    expect(
      codes(
        auditJovieImageColorDecision({
          control: 'source-reflection',
          subject: 'green wet-street reflection',
          reflectedColor: saturatedGreen,
          reflectionSourcePresent: false,
        })
      )
    ).toContain('missing-reflection-source');

    expect(
      codes(
        auditJovieImageColorDecision({
          control: 'source-reflection',
          subject: 'green chrome reflection from Ion signage',
          sourceColor: ionScene,
          reflectedColor: saturatedGreen,
          reflectionSourcePresent: true,
        })
      )
    ).toContain('reflection-source-mismatch');

    expect(
      auditJovieImageColorDecision({
        control: 'source-reflection',
        subject: 'Ion puddle reflection from visible Ion tube',
        sourceColor: ionScene,
        reflectedColor: { lightness: 70, chroma: 0.12, hue: 246 },
        reflectionSourcePresent: true,
      })
    ).toEqual([]);
  });

  it('rejects oily or clipped skin highlights before taste admission', () => {
    expect(
      codes(
        auditJovieImageColorDecision({
          control: 'skin-material',
          subject: 'portrait forehead highlights',
          skin: {
            clippedHighlights: true,
            oilyHighlights: true,
            texturePreserved: false,
            localSpecularBelievable: false,
          },
        })
      )
    ).toEqual(
      expect.arrayContaining([
        'clipped-skin-highlights',
        'oily-skin-highlights',
        'skin-texture-lost',
        'skin-specular-unbelievable',
      ])
    );
  });

  it('checks subject separation without banning natural materials by default', () => {
    expect(
      codes(
        auditJovieImageColorDecision({
          control: 'subject-separation',
          subject: 'artist in low-contrast sand architecture',
          separation: {
            lightnessDelta: 3,
            chromaDelta: 0.01,
            hueDelta: 8,
          },
        })
      )
    ).toContain('weak-subject-separation');

    expect(
      auditJovieImageColorDecision({
        control: 'subject-separation',
        subject: 'artist separated from warm sand by edge light',
        separation: {
          lightnessDelta: 3,
          chromaDelta: 0.01,
          hueDelta: 8,
          edgeLight: true,
        },
      })
    ).toEqual([]);
  });

  it('rejects grading as a way to recolor controllable scene design', () => {
    expect(
      codes(
        auditJovieImageColorDecision({
          control: 'grade',
          subject: 'green couch graded blue',
          color: saturatedGreen,
          requestedAction: 'grade-recolor',
        })
      )
    ).toContain('forbidden-post-hoc-recoloring');
  });

  it('retires stale Carbon palette guidance from active prompt and brand paths', () => {
    const activeSources = [
      'apps/web/data/marketing/index.ts',
      'apps/web/data/marketing/sections.ts',
      'apps/web/lib/brand/tokens.ts',
      'apps/web/components/organisms/entity-card/types.ts',
      '.claude/figma-design-rules.md',
    ] as const;
    const forbidden = [
      /carbon-style palette/i,
      /Carbon accent palette/,
      /DESIGN\.md System A/,
      /#5e6ad2\s+.*Linear purple-blue/i,
      /#4D7DFF|#9B4DFF|#EA4A9C|#FFAB2E|#43B85C|#22B8A7/,
    ] as const;

    for (const sourcePath of activeSources) {
      const source = readRepoSource(sourcePath);
      for (const pattern of forbidden) {
        expect(source, `${sourcePath} matched ${pattern}`).not.toMatch(pattern);
      }
    }
  });
});
