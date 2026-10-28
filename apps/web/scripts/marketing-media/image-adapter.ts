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
  /**
   * Quiet area reserved for the headline and UI. Prompts name both fields.
   * Low luminance, no light, no detail.
   */
  readonly quietZone: {
    readonly position: string;
    readonly size: string;
  };
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

/**
 * Art-direction block shared by every marketing image provider. One focal
 * point, one named quiet zone, light kept off that zone.
 */
export function marketingImagePrompt(request: ImageGenerationRequest): string {
  const position = request.quietZone.position.trim();
  const size = request.quietZone.size.trim();
  if (!position || !size) {
    throw new Error(
      'Image-generation prompt requires a quiet content zone position and size'
    );
  }
  return [
    `Aspect ratio about ${request.width}:${request.height}. No text, logos, watermarks or UI.`,
    'One focal point. Generate this plate for its specific layout, with the overlaid content in mind.',
    `Quiet content zone: ${position}. Size: ${size}. Low luminance, no light and no detail. Reserve it for the headline and UI.`,
    'Place light away from or behind that zone. Never blow the zone out.',
    `Art direction: ${request.brief}`,
    `Subject: ${request.prompt}`,
  ].join('\n');
}

export interface ImageGenerationAdapter {
  readonly provider: string;
  readonly model: string;
  /** Model family, so evaluators can refuse to share it with the producer. */
  readonly family: string;
  generate(request: ImageGenerationRequest): Promise<ImageGenerationOutcome>;
}
