import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { captureError } from '@/lib/error-tracking';
import { withTimeout } from '@/lib/resilience/primitives';

export type ClassificationResult = {
  clusterSlug: string | null;
  confidence: number; // 0..1
  reasoning?: string;
};

export const CLASSIFIER_AUTO_CLUSTER_THRESHOLD = 0.7;
export const CLASSIFIER_MIN_CONFIDENCE = 0.6;

const CLASSIFIER_TIMEOUT_MS = 10_000;

function buildPrompt(
  userText: string,
  clusters: Array<{ slug: string; displayName: string }>
): string {
  const clusterList = clusters
    .map(c => `- ${c.slug} (${c.displayName})`)
    .join('\n');
  return `You classify free-form music release tasks into one of the following clusters.

Clusters:
${clusterList}

Task text: """${userText}"""

Return JSON ONLY in this exact shape (no prose before or after):
{"clusterSlug": "<slug or null>", "confidence": <0..1>, "reasoning": "<one short sentence>"}

Rules:
- clusterSlug must be one of the listed slugs above, or null if no cluster fits.
- confidence is a number from 0 to 1. Use null for clusterSlug when confidence would be below ${CLASSIFIER_MIN_CONFIDENCE}.
- Be strict. If the task is ambiguous or off-topic, return clusterSlug=null.`;
}

function tryExtractJson(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    // fall through
  }
  const match = trimmed.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      return JSON.parse(match[0]);
    } catch {
      // fall through
    }
  }
  return null;
}

function coerceResult(raw: unknown): ClassificationResult {
  if (!raw || typeof raw !== 'object') {
    return { clusterSlug: null, confidence: 0 };
  }
  const obj = raw as Record<string, unknown>;
  const slugVal = obj.clusterSlug;
  const confVal = obj.confidence;
  const reasoningVal = obj.reasoning;

  const clusterSlug =
    typeof slugVal === 'string' && slugVal.length > 0 ? slugVal : null;
  const confidence =
    typeof confVal === 'number' && Number.isFinite(confVal)
      ? Math.max(0, Math.min(1, confVal))
      : 0;
  const reasoning = typeof reasoningVal === 'string' ? reasoningVal : undefined;

  return { clusterSlug, confidence, reasoning };
}

type ClassifyDeps = {
  createMessage?: (args: {
    prompt: string;
  }) => Promise<{ text: string } | null>;
};

/**
 * Classify a free-form task into one of the known cluster slugs using Haiku.
 * Returns `{clusterSlug: null, confidence: 0}` on any failure; callers must
 * not treat classification failures as user-visible errors.
 */
export async function classifyTaskCluster(
  userText: string,
  clusters: Array<{ slug: string; displayName: string }>,
  deps: ClassifyDeps = {}
): Promise<ClassificationResult> {
  if (!userText?.trim() || clusters.length === 0) {
    return { clusterSlug: null, confidence: 0 };
  }

  const prompt = buildPrompt(userText, clusters);

  const runReal = async (): Promise<{ text: string } | null> => {
    const anthropic = new Anthropic();
    const message = await withTimeout(
      anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 200,
        messages: [{ role: 'user', content: prompt }],
      }),
      {
        timeoutMs: CLASSIFIER_TIMEOUT_MS,
        context: 'classifyTaskCluster',
      }
    );
    const textBlock = message.content.find(b => b.type === 'text');
    if (textBlock?.type !== 'text') return null;
    return { text: textBlock.text };
  };

  try {
    const out = await (deps.createMessage ?? runReal)({ prompt });
    if (!out) return { clusterSlug: null, confidence: 0 };
    const parsed = tryExtractJson(out.text);
    const result = coerceResult(parsed);

    // Enforce cluster membership: if slug isn't in the known list, null it out.
    if (
      result.clusterSlug &&
      !clusters.some(c => c.slug === result.clusterSlug)
    ) {
      return { clusterSlug: null, confidence: 0, reasoning: result.reasoning };
    }

    // Enforce minimum confidence.
    if (result.confidence < CLASSIFIER_MIN_CONFIDENCE) {
      return { clusterSlug: null, confidence: result.confidence };
    }

    return result;
  } catch (error) {
    captureError('classifyTaskCluster failed', error, {
      context: 'release-tasks/classify-task-cluster',
    });
    return { clusterSlug: null, confidence: 0 };
  }
}
