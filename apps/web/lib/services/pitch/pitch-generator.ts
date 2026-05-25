/**
 * Pitch Generator
 *
 * Generates AI-powered playlist pitches for music releases using
 * structured output via the Vercel AI SDK.
 *
 * Follows the same pattern as insight-generator.ts:
 * generateObject + Zod schema + AI Gateway.
 */

import { gateway } from '@ai-sdk/gateway';
import { z } from 'zod';
import { generateObject } from '@/lib/ai/sdk';
import { PITCH_MODEL } from '@/lib/constants/ai-models';
import {
  buildPitchDraftSystemPrompt,
  buildPitchDraftUserPrompt,
  buildSystemPrompt,
  buildUserPrompt,
} from './prompts';
import type { PitchDestination } from './targets';
import {
  type PitchDraftGenerationResult,
  type PitchGenerationResult,
  type PitchInput,
  PLATFORM_LIMITS,
} from './types';

const pitchResponseSchema = z.object({
  spotify: z.string().max(PLATFORM_LIMITS.spotify),
  appleMusic: z.string().max(PLATFORM_LIMITS.appleMusic),
  amazon: z.string().max(PLATFORM_LIMITS.amazon),
  generic: z.string().max(PLATFORM_LIMITS.generic),
});

const pitchDraftResponseSchema = z.object({
  subjectLine: z.string().max(120).nullable(),
  body: z.string().max(2000),
});

/**
 * Truncate text to a maximum length, preferring sentence boundaries.
 * Falls back to a hard slice if no sentence boundary is found.
 */
export function truncateToLimit(text: string, limit: number): string {
  if (text.length <= limit) return text;

  // Try to find the last sentence boundary within the limit
  const truncated = text.slice(0, limit);
  const lastPeriod = truncated.lastIndexOf('. ');
  const lastExclaim = truncated.lastIndexOf('! ');
  const lastQuestion = truncated.lastIndexOf('? ');
  const lastBoundary = Math.max(lastPeriod, lastExclaim, lastQuestion);

  if (lastBoundary > limit * 0.3) {
    // Found a sentence boundary past the first third — use it
    return truncated.slice(0, lastBoundary + 1);
  }

  // No good sentence boundary — hard slice
  return truncated;
}

/**
 * Generates playlist pitches for a release across multiple platforms.
 */
export async function generatePitches(
  input: PitchInput,
  instructions?: string
): Promise<PitchGenerationResult> {
  const { object, usage } = await generateObject({
    model: gateway(PITCH_MODEL),
    schema: pitchResponseSchema,
    system: buildSystemPrompt(),
    prompt: buildUserPrompt(input, instructions),
    temperature: 0.4,
    maxOutputTokens: 2048,
    experimental_telemetry: {
      isEnabled: true,
      recordInputs: true,
      recordOutputs: true,
      functionId: 'jovie-pitch-generator',
      metadata: { model: PITCH_MODEL },
    },
  });

  // Safety net: hard-cap each pitch to its platform limit
  const pitches = {
    spotify: truncateToLimit(object.spotify, PLATFORM_LIMITS.spotify),
    appleMusic: truncateToLimit(object.appleMusic, PLATFORM_LIMITS.appleMusic),
    amazon: truncateToLimit(object.amazon, PLATFORM_LIMITS.amazon),
    generic: truncateToLimit(object.generic, PLATFORM_LIMITS.generic),
    generatedAt: new Date().toISOString(),
    modelUsed: PITCH_MODEL,
  };

  return {
    pitches,
    promptTokens: usage.inputTokens ?? 0,
    completionTokens: usage.outputTokens ?? 0,
  };
}

/**
 * Generates one destination-aware pitch draft for chat.
 */
export async function generatePitchDraft(params: {
  readonly input: PitchInput;
  readonly destination: PitchDestination;
  readonly instructions?: string;
}): Promise<PitchDraftGenerationResult> {
  const { input, destination, instructions } = params;
  const { object, usage } = await generateObject({
    model: gateway(PITCH_MODEL),
    schema: pitchDraftResponseSchema,
    system: buildPitchDraftSystemPrompt(),
    prompt: buildPitchDraftUserPrompt({ input, destination, instructions }),
    temperature: 0.4,
    maxOutputTokens: 1200,
    experimental_telemetry: {
      isEnabled: true,
      recordInputs: true,
      recordOutputs: true,
      functionId: 'jovie-pitch-draft-generator',
      metadata: {
        model: PITCH_MODEL,
        target: destination.target,
        platform: destination.platform ?? 'none',
      },
    },
  });

  return {
    pitch: {
      target: destination.target,
      platform: destination.platform,
      destinationLabel: destination.label,
      audience: destination.audience,
      subjectLine: object.subjectLine?.trim() || null,
      body: truncateToLimit(object.body.trim(), destination.characterLimit),
      generatedAt: new Date().toISOString(),
      modelUsed: PITCH_MODEL,
    },
    destination,
    promptTokens: usage.inputTokens ?? 0,
    completionTokens: usage.outputTokens ?? 0,
  };
}
