import {
  CANVAS_DEFAULT_DURATION_SEC,
  CANVAS_GENERATION_DIMENSIONS,
  SPOTIFY_CANVAS_SPEC,
} from './specs';
import type { CanvasGenerationInput } from './types';

/**
 * Build the AI prompt for processing album artwork before video generation.
 *
 * This prompt instructs the AI to:
 * 1. Remove any text/logos from the artwork
 * 2. Upscale to canvas dimensions
 * 3. Prepare for animation
 */
export function buildArtworkProcessingPrompt(
  input: CanvasGenerationInput
): string {
  const removeText = input.style?.removeText !== false; // default true
  const upscale = input.style?.upscale !== false; // default true

  const steps: string[] = [];

  if (removeText) {
    steps.push(
      'Remove all text, logos, and watermarks from the album artwork while preserving the visual style and composition.'
    );
  }

  if (upscale) {
    steps.push(
      `Upscale the artwork to ${CANVAS_GENERATION_DIMENSIONS.width}x${CANVAS_GENERATION_DIMENSIONS.height} pixels (9:16 portrait) using AI upscaling. Maintain image quality and add detail where needed.`
    );
  }

  steps.push(
    'Ensure the final image is clean, high-quality, and suitable for animation.'
  );

  return steps.join('\n');
}

/**
 * Build the AI prompt for generating a canvas video from processed artwork.
 */
export function buildVideoGenerationPrompt(
  input: CanvasGenerationInput
): string {
  const motionType = input.style?.motionType ?? 'ambient';
  const durationSec = CANVAS_DEFAULT_DURATION_SEC;

  const motionDescriptions: Record<string, string> = {
    zoom: 'a slow, smooth zoom into the center of the artwork, creating depth and focus',
    pan: 'a gentle horizontal or vertical pan across the artwork, revealing details',
    particles:
      'subtle floating particles or light effects overlaid on the artwork',
    morph:
      'subtle morphing and breathing effects that make the artwork feel alive',
    ambient:
      'subtle ambient motion with gentle color shifts and soft movement that creates a mesmerizing loop',
  };

  const motionDescription =
    motionDescriptions[motionType] ?? motionDescriptions.ambient;

  return `Generate a ${durationSec}-second looping video for Spotify Canvas.

**Source:** Album artwork for "${input.releaseTitle}" by ${input.artistName}
**Motion:** Create ${motionDescription}.
**Requirements:**
- ${CANVAS_GENERATION_DIMENSIONS.width}x${CANVAS_GENERATION_DIMENSIONS.height} pixels (9:16 portrait)
- ${SPOTIFY_CANVAS_SPEC.fps} fps
- Seamless loop (end frame should blend smoothly back to start)
- No text or UI elements
- Mood should match the artwork's visual tone
- H.264 codec, MP4 container`;
}
