/**
 * Marketing image generation pipeline (JOV-7250).
 *
 * adapter → asset on disk → provenance (C2PA when c2patool exists, sidecar
 * always) → scripts/vision/art-evaluator.mjs. An asset is `generated` only
 * when the art evaluator passes; everything else is a typed non-success the
 * mediaExport.ts seam maps to a failed output. Surface recipes and
 * ineligible virtual models are refused before any provider call.
 */

import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { isEligibleVirtualModel } from '@/data/marketing/factory/mediaDecision';
import { MARKETING_MEDIA_RECIPE_SOURCE_MATRIX } from '@/data/marketing/mediaRecipes';
import type { SpawnSyncLike } from './credentials';
import type {
  ImageGenerationAdapter,
  ImageGenerationRequest,
} from './image-adapter';
import {
  type ArtEvaluationRecord,
  buildC2paManifestDefinition,
  embedC2paManifest,
  IPTC_TRAINED_ALGORITHMIC_MEDIA,
  MARKETING_MEDIA_PROVENANCE_SCHEMA,
  type ProvenanceSidecar,
  sidecarPathFor,
} from './provenance';

export const DEFAULT_ART_JUDGE_MODEL = 'openai/gpt-5.5';

export interface ArtGateInput {
  readonly imagePath: string;
  readonly brief: string;
  readonly characterId: string | null;
  readonly identityComps?: readonly string[];
  readonly producerFamily: string;
}

export type ArtGate = (input: ArtGateInput) => Promise<ArtEvaluationRecord>;

interface ArtEvaluatorModule {
  buildFocalEvaluation(input: { image: string; brief: string }): object;
  buildIdentityEvaluation(input: {
    modelId: string;
    render: string;
    comps: readonly string[];
  }): object;
  evaluateArt(
    request: object,
    transport: unknown
  ): Promise<{
    ok: boolean;
    verdict: { notes: string } | null;
    error?: string;
  }>;
  subscriptionVisionTransport(): unknown;
}

const loadArtEvaluator = () =>
  import(
    '../../../../scripts/vision/art-evaluator.mjs'
  ) as Promise<ArtEvaluatorModule>;

/**
 * Gate backed by scripts/vision/art-evaluator.mjs: focal check always,
 * identity check for virtual-model renders. The judge may not share a model
 * family with the producer, and a people render without comps fails.
 */
export function createArtEvaluatorGate(
  options: {
    readonly judgeModel?: string;
    readonly load?: () => Promise<ArtEvaluatorModule>;
  } = {}
): ArtGate {
  const judgeModel = options.judgeModel ?? DEFAULT_ART_JUDGE_MODEL;
  const load = options.load ?? loadArtEvaluator;
  return async input => {
    const judgeFamily = judgeModel.split('/')[0] ?? '';
    const fail = (note: string): ArtEvaluationRecord => ({
      ok: false,
      modes: [],
      judgeModel,
      notes: [note],
    });
    if (judgeFamily === input.producerFamily) {
      return fail(`judge ${judgeModel} shares family with the producer`);
    }
    if (input.characterId && !input.identityComps?.length) {
      return fail(`identity comps are required for ${input.characterId}`);
    }
    const evaluator = await load();
    const transport = evaluator.subscriptionVisionTransport();
    const requests: [string, object][] = [
      [
        'focal',
        evaluator.buildFocalEvaluation({
          image: input.imagePath,
          brief: input.brief,
        }),
      ],
    ];
    if (input.characterId && input.identityComps) {
      requests.push([
        'identity',
        evaluator.buildIdentityEvaluation({
          modelId: input.characterId,
          render: input.imagePath,
          comps: input.identityComps,
        }),
      ]);
    }
    const notes: string[] = [];
    let ok = true;
    for (const [mode, request] of requests) {
      const result = await evaluator.evaluateArt(
        { ...request, judgeModel },
        transport
      );
      ok &&= result.ok;
      notes.push(`${mode}: ${result.verdict?.notes ?? result.error ?? ''}`);
    }
    return { ok, modes: requests.map(([mode]) => mode), judgeModel, notes };
  };
}

export type MarketingImageResult =
  | {
      readonly status: 'rejected';
      readonly reason: string;
    }
  | {
      readonly status: 'credentials-unavailable' | 'failed';
      readonly provider: string;
      readonly reason: string;
    }
  | {
      readonly status: 'art-rejected' | 'generated';
      readonly assetPath: string;
      readonly sidecarPath: string;
      readonly sidecar: ProvenanceSidecar;
      readonly mime: string;
      readonly width: number;
      readonly height: number;
    };

export interface GenerateMarketingImageInput {
  readonly request: ImageGenerationRequest;
  readonly adapter: ImageGenerationAdapter;
  readonly assetId: string;
  readonly outDir: string;
  readonly artGate?: ArtGate;
  readonly now?: () => Date;
  readonly spawnImpl?: SpawnSyncLike;
  readonly fs?: {
    readonly mkdir: (path: string) => Promise<unknown>;
    readonly writeFile: (
      path: string,
      data: Uint8Array | string
    ) => Promise<unknown>;
  };
}

const defaultFs = {
  mkdir: (path: string) => mkdir(path, { recursive: true }),
  writeFile: (path: string, data: Uint8Array | string) => writeFile(path, data),
};

export async function generateMarketingImage(
  input: GenerateMarketingImageInput
): Promise<MarketingImageResult> {
  const { request, adapter } = input;
  // Unknown ids (a Pen ref, a typo) are refused like capture-only recipes.
  const sources = Object.hasOwn(
    MARKETING_MEDIA_RECIPE_SOURCE_MATRIX,
    request.recipeId
  )
    ? MARKETING_MEDIA_RECIPE_SOURCE_MATRIX[request.recipeId]
    : null;
  if (!sources) {
    return {
      status: 'rejected',
      reason: `${String(request.recipeId)} is not a marketing media recipe`,
    };
  }
  if (!sources.includes('generated-artwork')) {
    return {
      status: 'rejected',
      reason: `${request.recipeId} only accepts real captures; product UI is never generated`,
    };
  }
  if (request.characterId && !isEligibleVirtualModel(request.characterId)) {
    return {
      status: 'rejected',
      reason: `virtual model ${request.characterId} is not campaign-eligible`,
    };
  }

  const outcome = await adapter.generate(request);
  if (outcome.status !== 'generated') return outcome;

  const fs = input.fs ?? defaultFs;
  const now = input.now ?? (() => new Date());
  await fs.mkdir(input.outDir);
  const assetPath = join(input.outDir, `${input.assetId}.png`);
  await fs.writeFile(assetPath, outcome.bytes);

  const manifestPath = `${assetPath}.c2pa.json`;
  await fs.writeFile(
    manifestPath,
    JSON.stringify(
      buildC2paManifestDefinition({
        title: input.assetId,
        provider: outcome.provider,
        model: outcome.model,
      }),
      null,
      2
    )
  );
  const c2pa = embedC2paManifest({
    assetPath,
    manifestPath,
    outputPath: join(input.outDir, `${input.assetId}.c2pa.png`),
    spawnImpl: input.spawnImpl,
  });

  const artGate = input.artGate ?? createArtEvaluatorGate();
  const artEvaluation = await artGate({
    imagePath: assetPath,
    brief: request.brief,
    characterId: request.characterId,
    identityComps: request.identityComps,
    producerFamily: adapter.family,
  });

  const sidecar: ProvenanceSidecar = {
    schema: MARKETING_MEDIA_PROVENANCE_SCHEMA,
    assetId: input.assetId,
    assetPath,
    sha256: createHash('sha256').update(outcome.bytes).digest('hex'),
    aiGenerated: true,
    digitalSourceType: IPTC_TRAINED_ALGORITHMIC_MEDIA,
    generator: {
      provider: outcome.provider,
      model: outcome.model,
      family: adapter.family,
    },
    prompt: request.prompt,
    recipeId: request.recipeId,
    characterId: request.characterId,
    createdAt: now().toISOString(),
    c2pa,
    artEvaluation,
  };
  const sidecarPath = sidecarPathFor(assetPath);
  await fs.writeFile(sidecarPath, `${JSON.stringify(sidecar, null, 2)}\n`);

  return {
    status: artEvaluation.ok ? 'generated' : 'art-rejected',
    assetPath,
    sidecarPath,
    sidecar,
    mime: outcome.mime,
    width: outcome.width,
    height: outcome.height,
  };
}
