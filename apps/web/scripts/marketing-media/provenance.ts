/**
 * Provenance for generated marketing media (JOV-7250, EU AI Act Art. 50).
 *
 * Every generated asset gets a sidecar JSON with the ai-generated flag and
 * the IPTC trainedAlgorithmicMedia source type. When c2patool is installed
 * the same facts are embedded as a C2PA manifest; when it is not, the
 * sidecar records why, so the gap is visible instead of silent.
 */

import { spawnSync } from 'node:child_process';
import type { SpawnSyncLike } from './credentials';

export const MARKETING_MEDIA_PROVENANCE_SCHEMA =
  'jovie.media-provenance/v1' as const;

export const IPTC_TRAINED_ALGORITHMIC_MEDIA =
  'http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia';

export const C2PA_CLAIM_GENERATOR = 'jovie-marketing-factory/1.0';

export type C2paStatus =
  | {
      readonly status: 'embedded';
      readonly tool: 'c2patool';
      readonly signedAssetPath: string;
    }
  | { readonly status: 'unavailable'; readonly reason: string };

export interface ArtEvaluationRecord {
  readonly ok: boolean;
  readonly modes: readonly string[];
  readonly judgeModel: string;
  readonly notes: readonly string[];
}

export interface ProvenanceSidecar {
  readonly schema: typeof MARKETING_MEDIA_PROVENANCE_SCHEMA;
  readonly assetId: string;
  readonly assetPath: string;
  readonly sha256: string;
  readonly aiGenerated: true;
  readonly digitalSourceType: typeof IPTC_TRAINED_ALGORITHMIC_MEDIA;
  readonly generator: {
    readonly provider: string;
    readonly model: string;
    readonly family: string;
  };
  readonly prompt: string;
  readonly recipeId: string;
  readonly characterId: string | null;
  readonly createdAt: string;
  readonly c2pa: C2paStatus;
  readonly artEvaluation: ArtEvaluationRecord | null;
}

export function sidecarPathFor(assetPath: string): string {
  return `${assetPath}.provenance.json`;
}

/** c2patool manifest definition: a c2pa.created action marked AI-generated. */
export function buildC2paManifestDefinition(input: {
  readonly title: string;
  readonly provider: string;
  readonly model: string;
}) {
  return {
    claim_generator: C2PA_CLAIM_GENERATOR,
    title: input.title,
    assertions: [
      {
        label: 'c2pa.actions',
        data: {
          actions: [
            {
              action: 'c2pa.created',
              digitalSourceType: IPTC_TRAINED_ALGORITHMIC_MEDIA,
              softwareAgent: `${input.provider}/${input.model}`,
            },
          ],
        },
      },
    ],
  };
}

/**
 * Embeds the manifest with c2patool when it is installed. Signing uses the
 * tool's configured certificate; production signing keys are a follow-up.
 */
export function embedC2paManifest(input: {
  readonly assetPath: string;
  readonly manifestPath: string;
  readonly outputPath: string;
  readonly spawnImpl?: SpawnSyncLike;
}): C2paStatus {
  const spawnImpl = input.spawnImpl ?? (spawnSync as SpawnSyncLike);
  const probe = spawnImpl('c2patool', ['--version'], {
    encoding: 'utf8',
    timeout: 10_000,
  });
  if (probe.error || probe.status !== 0) {
    return {
      status: 'unavailable',
      reason: 'c2patool is not installed; provenance is sidecar-only',
    };
  }
  const result = spawnImpl(
    'c2patool',
    [input.assetPath, '-m', input.manifestPath, '-o', input.outputPath, '-f'],
    { encoding: 'utf8', timeout: 60_000 }
  );
  if (result.error || result.status !== 0) {
    return {
      status: 'unavailable',
      reason: `c2patool exited ${result.status ?? 'without status'}; provenance is sidecar-only`,
    };
  }
  return {
    status: 'embedded',
    tool: 'c2patool',
    signedAssetPath: input.outputPath,
  };
}
