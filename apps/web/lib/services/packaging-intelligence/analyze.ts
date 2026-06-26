import 'server-only';

import { gateway } from '@ai-sdk/gateway';
import { generateObject } from '@/lib/ai/sdk';
import { type AiTelemetryIdentity, buildAiTelemetry } from '@/lib/ai/telemetry';
import { PACKAGING_INTELLIGENCE_MODEL } from '@/lib/constants/ai-models';
import { captureError } from '@/lib/error-tracking';
import { logger } from '@/lib/utils/logger';
import {
  buildPackagingSystemPrompt,
  buildPackagingUserPrompt,
} from './prompts';
import { type PackagingLlmOutput, packagingLlmOutputSchema } from './types';

export interface PackagingLlmAnalysisInput {
  readonly videoId: string;
  readonly title: string;
  readonly description: string;
  readonly thumbnailUrl?: string;
  readonly transcriptText: string;
  readonly first30sHookText: string;
  readonly identity?: AiTelemetryIdentity;
}

export interface PackagingLlmAnalysisResult {
  readonly output: PackagingLlmOutput;
  readonly modelUsed: string;
  readonly promptTokens: number;
  readonly completionTokens: number;
}

export async function analyzePackagingWithLlm(
  input: PackagingLlmAnalysisInput
): Promise<PackagingLlmAnalysisResult> {
  const { object, usage } = await generateObject({
    model: gateway(PACKAGING_INTELLIGENCE_MODEL),
    schema: packagingLlmOutputSchema,
    system: buildPackagingSystemPrompt(),
    prompt: buildPackagingUserPrompt(input),
    temperature: 0.2,
    maxOutputTokens: 1200,
    experimental_telemetry: buildAiTelemetry({
      functionId: 'jovie-packaging-intelligence',
      identity: input.identity,
      metadata: {
        model: PACKAGING_INTELLIGENCE_MODEL,
        videoId: input.videoId,
      },
      recordInputs: true,
      recordOutputs: true,
    }),
  });

  return {
    output: object,
    modelUsed: PACKAGING_INTELLIGENCE_MODEL,
    promptTokens: usage.inputTokens ?? 0,
    completionTokens: usage.outputTokens ?? 0,
  };
}

export async function analyzePackagingWithLlmSafe(
  input: PackagingLlmAnalysisInput
): Promise<PackagingLlmAnalysisResult | null> {
  try {
    return await analyzePackagingWithLlm(input);
  } catch (error) {
    logger.error('[packaging-intelligence] LLM analysis failed', {
      videoId: input.videoId,
      error: error instanceof Error ? error.message : String(error),
    });
    await captureError('Packaging intelligence LLM analysis failed', error, {
      videoId: input.videoId,
    });
    return null;
  }
}
