/**
 * Provenance helpers for generated marketing media (JOV-7250).
 *
 * Every generated asset carries two things:
 *  - an unsigned C2PA-style manifest written as a `<asset>.c2pa.json`
 *    sidecar (real C2PA signing requires a certificate chain; the manifest
 *    records the claim structure so a signer can attach later), and
 *  - explicit AI-generated markup (`AI_GENERATED_MARKUP`), embedded in the
 *    manifest's CreativeWork assertion and stamped into HTML surfaces via
 *    `data-ai-generated`.
 *
 * `art-evaluator.mjs` rejects any generated asset missing this sidecar.
 */
import { writeFileSync } from 'node:fs';

export const GENERATED_ASSET_PROVENANCE_SCHEMA = 'jovie-generated-asset/v1';

/** AI-generated markup string stamped on rendered surfaces. */
export const AI_GENERATED_MARKUP = 'data-ai-generated="true"';

export interface GeneratedAssetProvenanceInput {
  readonly assetId: string;
  /** Adapter/model that produced the asset, e.g. `fal/flux-schnell`. */
  readonly generator: string;
  readonly prompt: string;
  readonly sourceDecisionRule?: string;
}

export interface GeneratedAssetProvenance {
  readonly schema: typeof GENERATED_ASSET_PROVENANCE_SCHEMA;
  readonly assetId: string;
  readonly generator: string;
  readonly aiGenerated: true;
  readonly markup: typeof AI_GENERATED_MARKUP;
  readonly c2pa: {
    readonly claimGenerator: string;
    readonly assertions: readonly {
      readonly label: string;
      readonly data: Record<string, unknown>;
    }[];
    readonly signature: null;
  };
}

export function buildGeneratedAssetProvenance(
  input: GeneratedAssetProvenanceInput
): GeneratedAssetProvenance {
  return {
    schema: GENERATED_ASSET_PROVENANCE_SCHEMA,
    assetId: input.assetId,
    generator: input.generator,
    aiGenerated: true,
    markup: AI_GENERATED_MARKUP,
    c2pa: {
      claimGenerator: `jovie-marketing-media/${GENERATED_ASSET_PROVENANCE_SCHEMA}`,
      assertions: [
        {
          label: 'c2pa.actions',
          data: {
            actions: [
              {
                action: 'c2pa.created',
                digitalSourceType: 'trainedAlgorithmicMedia',
              },
            ],
          },
        },
        {
          label: 'stds.schema-org.CreativeWork',
          data: {
            '@type': 'CreativeWork',
            digitalSourceType:
              'http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia',
            prompt: input.prompt,
            decisionRule: input.sourceDecisionRule ?? null,
          },
        },
      ],
      signature: null,
    },
  };
}

export function provenanceSidecarPath(assetPath: string): string {
  return `${assetPath}.c2pa.json`;
}

export function writeProvenanceSidecar(
  assetPath: string,
  provenance: GeneratedAssetProvenance
): string {
  const sidecar = provenanceSidecarPath(assetPath);
  writeFileSync(sidecar, `${JSON.stringify(provenance, null, 2)}\n`);
  return sidecar;
}
