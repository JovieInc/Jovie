import 'server-only';

import { gateway, generateObject } from '@/lib/ai/sdk';
import { type AiTelemetryIdentity, buildAiTelemetry } from '@/lib/ai/telemetry';
import { PACKAGING_INTELLIGENCE_MODEL } from '@/lib/constants/ai-models';
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

function buildPackagingSystemPrompt(): string {
  return `You are a YouTube packaging intelligence extractor.
Return structured JSON only. Extract title/thumbnail promise, niche, and whether the first 30 seconds deliver that promise.
Classify niche into exactly one schema enum. Never invent facts absent from the provided metadata or transcript.`;
}

function buildPackagingUserPrompt(input: PackagingLlmAnalysisInput): string {
  const thumbnailLine = input.thumbnailUrl
    ? `Thumbnail URL: ${input.thumbnailUrl}`
    : 'Thumbnail URL: not provided';

  return `Analyze packaging for YouTube video ${input.videoId}.
Title: ${input.title}
Description: ${input.description}
${thumbnailLine}
Full transcript:
${input.transcriptText || '(no transcript available)'}
First 30 seconds transcript:
${input.first30sHookText || '(no first-30s transcript available)'}`;
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
