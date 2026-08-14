import 'server-only';

import { gateway, generateObject } from '@/lib/ai/sdk';
import { type AiTelemetryIdentity, buildAiTelemetry } from '@/lib/ai/telemetry';
import { PACKAGING_INTELLIGENCE_MODEL } from '@/lib/constants/ai-models';
import {
  applyPackagingAnalyzeGate,
  PACKAGING_ANALYZE_GATE,
  PACKAGING_FORMAT_SPLIT_RULES,
  PACKAGING_FOUNDER_LOCK,
} from './format-rules';
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

export const PACKAGING_AUDIT_SYSTEM_PROMPT = `You are a YouTube packaging auditor. Return structured JSON only. Evidence, not vibes.

RULES
- Every recommendation needs an observation + evidence + evidenceTier (observed | transcript | platform_spec | prior | unknown).
- Never invent CTR, retention, or dimensions you did not receive. If unmeasured, mark unknown and still state the spec.
- CTR + retention are the continued-distribution gate. Do not score packaging as a vibe rating.
- Produce exactly two thumbnail variants. Each headline is mobile-legible and ≤3 words (set wordCount 1–3, mobileLegible true only when that holds). hookOffFace true. coversFace false.
- Safe-zone check against platform specs: thumb 1280×720; channel art 2560×1440 with 1546×423 safe zone; cover 3000×3000 JPG RGB and no URLs on the art.
- Extract title/thumbnail promise, niche, and whether the first 30 seconds deliver that promise.
- Classify niche into exactly one schema enum. Never invent facts absent from the provided metadata or transcript.
- Findings are terse. No overall score. artReadiness is uninspected or needs_work — never ready.

${PACKAGING_FORMAT_SPLIT_RULES}

${PACKAGING_FOUNDER_LOCK}

${PACKAGING_ANALYZE_GATE}`;

export function buildPackagingSystemPrompt(): string {
  return PACKAGING_AUDIT_SYSTEM_PROMPT;
}

function buildPackagingUserPrompt(input: PackagingLlmAnalysisInput): string {
  const thumbnailLine = input.thumbnailUrl
    ? `Thumbnail URL: ${input.thumbnailUrl}`
    : 'Thumbnail URL: not provided';

  return `Analyze packaging for YouTube video ${input.videoId}.
Title: ${input.title}
Description: ${input.description}
${thumbnailLine}
Rendered image inspected this run: no. A URL is not a visual observation. Set pixelsInspected false. Visual findings use evidenceTier unknown (platform_spec only for spec-only rows). Do not claim the art is ready, good, or done.
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
    maxOutputTokens: 1600,
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
    output: applyPackagingAnalyzeGate({
      output: object,
      pixelsInspected: false,
    }),
    modelUsed: PACKAGING_INTELLIGENCE_MODEL,
    promptTokens: usage.inputTokens ?? 0,
    completionTokens: usage.outputTokens ?? 0,
  };
}
