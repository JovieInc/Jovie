/**
 * The one image-generation adapter interface for the marketing factory
 * (JOV-7250). Providers (fal today) implement `generate`; the pipeline in
 * generate-image.ts owns provenance, the art evaluator gate and the
 * mediaExport.ts seam, so an adapter only turns a prompt into pixels.
 */

import type { MarketingMediaRecipeId } from '@/data/marketing/mediaRecipes';

export interface ImageGenerationRequest {
  readonly prompt: string;
  /** Must be a recipe whose source matrix accepts generated artwork. */
  readonly recipeId: MarketingMediaRecipeId;
  /** characterSystem model id for people renders, else null. */
  readonly characterId: string | null;
  readonly width: number;
  readonly height: number;
  /** Art-direction intent handed to the focal evaluator. */
  readonly brief: string;
  /** Canonical comp sheet paths; required for people renders. */
  readonly identityComps?: readonly string[];
}

export type ImageGenerationOutcome =
  | {
      readonly status: 'credentials-unavailable';
      readonly provider: string;
      readonly reason: string;
    }
  | {
      readonly status: 'failed';
      readonly provider: string;
      readonly reason: string;
    }
  | {
      readonly status: 'generated';
      readonly provider: string;
      readonly model: string;
      readonly bytes: Uint8Array;
      readonly mime: string;
      readonly width: number;
      readonly height: number;
    };

export interface ImageGenerationAdapter {
  readonly provider: string;
  readonly model: string;
  /** Model family, so evaluators can refuse to share it with the producer. */
  readonly family: string;
  generate(request: ImageGenerationRequest): Promise<ImageGenerationOutcome>;
}
