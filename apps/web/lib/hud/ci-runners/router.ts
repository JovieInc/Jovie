/**
 * Model router for the CI runner autoscaler (HUD module).
 *
 * Uses the Vercel AI SDK (`ai` + `@ai-sdk/gateway`) to route CI decisions
 * through our subscription chain:
 *
 *   Primary:   opencode-go/deepseek-v4-flash  (~$0.15/1M, fast)
 *   Local:     ollama/qwen3-coder:30b         (RTX 2080 Ti, free)
 *   Fallback:  openrouter/google/gemma-4-31b-it:free  (free, OpenRouter)
 *
 * Falls through on 401/402/429/5xx to the next tier.
 * When all routes fail, returns a safe deterministic default.
 *
 * @see https://ai-sdk.dev/providers/ai-sdk-providers/ai-gateway
 */

import { generateText } from 'ai';
import { createGateway } from '@ai-sdk/gateway';
import type {
  CiFailureReport,
  FailureClass,
  ModelProfile,
  ScalingRecommendation,
  TaskRoute,
} from './types';

// ── Gateway ────────────────────────────────────────────────────

function createGateway() {
  const gatewayUrl = process.env.AI_GATEWAY_URL;
  if (gatewayUrl) {
    return createGateway({ baseURL: gatewayUrl });
  }
  return createGateway();
}

// ── Model route table ─────────────────────────────────────────

const MODEL_ROUTES: Record<ModelProfile, TaskRoute> = {
  simple: {
    profile: 'simple',
    model: 'opencode-go/deepseek-v4-flash',
    fallbackModel: 'openrouter/google/gemma-4-31b-it:free',
    reasons: ['failure-classification', 'scaling-decision', 'ci-check'],
  },
  standard: {
    profile: 'standard',
    model: 'opencode-go/deepseek-v4-flash',
    fallbackModel: 'ollama/qwen3-coder:30b',
    reasons: ['failure-analysis', 'retry-strategy'],
  },
  escalation: {
    profile: 'escalation',
    model: 'opencode-go/deepseek-v4-flash',
    fallbackModel: 'ollama/qwen3-coder:30b',
    reasons: ['complex-analysis', 'root-cause', 'escalation-draft'],
  },
};

/** Select a model route based on task complexity. */
export function selectRoute(
  need: 'classification' | 'analysis' | 'escalation',
): TaskRoute {
  switch (need) {
    case 'classification':
      return MODEL_ROUTES.simple;
    case 'analysis':
      return MODEL_ROUTES.standard;
    case 'escalation':
      return MODEL_ROUTES.escalation;
  }
}

/** All routes for status reporting. */
export function listRoutes(): ReadonlyArray<{
  readonly profile: ModelProfile;
  readonly model: string;
  readonly fallback: string;
}> {
  return Object.values(MODEL_ROUTES).map((r) => ({
    profile: r.profile,
    model: r.model,
    fallback: r.fallbackModel,
  }));
}

// ── CI failure classification ─────────────────────────────────

/**
 * Classify a CI failure using the model router.
 * Returns a structured report with classification, confidence, and recommendation.
 */
export async function classifyFailure(
  runContext: string,
): Promise<CiFailureReport> {
  const route = selectRoute('classification');
  const gateway = createGateway();

  const classificationPrompt = `You are an expert CI engineer analyzing a workflow run failure.

Classify the failure into exactly one of these categories:
- "known-flake" — A previously seen intermittent failure (timeout, network, resource exhaustion)
- "infrastructure" — CI infra issue (runner unavailable, Docker failure, disk full)
- "test-flake" — Test that fails intermittently without code changes (race condition, timing)
- "real-failure" — A genuine regression introduced by the code change
- "tooling-issue" — Build tool/linter/formatter/config problem

Return ONLY valid JSON (no markdown, no explanation):
{
  "failureClass": "<category>",
  "confidence": <0.0-1.0>,
  "recommendation": "<retry|escalate|ignore|investigate>",
  "reasoning": "<one-line explanation>",
  "suggestedAction": "<what to do>"
}`;

  try {
    const { text } = await generateText({
      model: gateway(route.model),
      system: classificationPrompt,
      messages: [{ role: 'user', content: runContext }],
      temperature: 0.1,
      maxTokens: 400,
    });
    return parseFailureResponse(text, runContext);
  } catch {
    // Fallback to secondary model
    try {
      const { text } = await generateText({
        model: gateway(route.fallbackModel),
        system: `Classify this CI failure as known-flake, infrastructure, test-flake, real-failure, or tooling-issue. Return JSON with failureClass, confidence (0-1), recommendation (retry|escalate|ignore|investigate).`,
        messages: [{ role: 'user', content: runContext }],
        temperature: 0.1,
        maxTokens: 300,
      });
      return parseFailureResponse(text, runContext);
    } catch {
      // Last resort: safe deterministic default
      return {
        runId: 0,
        jobName: 'unknown',
        conclusion: 'failure',
        failureClass: 'real-failure',
        confidence: 0.3,
        recommendation: 'retry',
        reasoning: 'Model routing unavailable; defaulting to retry',
        suggestedAction: 'Retry the job and monitor',
      };
    }
  }
}

// ── Scaling recommendation ────────────────────────────────────

/**
 * Determine optimal scaling based on queue + failure state.
 * When recent failures are present, asks the AI for conservative advice.
 * Otherwise uses deterministic logic: scale to meet demand.
 */
export async function recommendScaling(context: {
  readonly queuedJobs: number;
  readonly activeRunners: number;
  readonly maxRunners: number;
  readonly recentFailures: number;
}): Promise<ScalingRecommendation> {
  const route = selectRoute('classification');
  const gateway = createGateway();

  const demandRunners = Math.min(context.queuedJobs, context.maxRunners);
  const deterministicDesired = Math.max(demandRunners, context.activeRunners + 1);

  // Skip AI for clean state
  if (context.recentFailures === 0) {
    return {
      desiredRunners: Math.min(deterministicDesired, context.maxRunners),
      reason: `Deterministic: ${context.queuedJobs} queued, ${context.activeRunners} active`,
      urgency: context.queuedJobs > context.activeRunners ? 'high' : 'low',
    };
  }

  try {
    const { text } = await generateText({
      model: gateway(route.model),
      system: `You are a CI autoscaler. Given queue state and recent failure rate, recommend runner count.
Be conservative if failures are high; aggressive if queue is backlogged.
Return ONLY valid JSON:
{ "desiredRunners": <number 1-N>, "reason": "<brief>", "urgency": "low|medium|high" }`,
      messages: [{ role: 'user', content: JSON.stringify(context) }],
      temperature: 0.1,
      maxTokens: 200,
    });

    const parsed = JSON.parse(text) as ScalingRecommendation;
    return {
      desiredRunners: Math.max(
        1,
        Math.min(parsed.desiredRunners, context.maxRunners),
      ),
      reason: parsed.reason ?? 'AI scaling recommendation',
      urgency: parsed.urgency ?? 'medium',
    };
  } catch {
    return {
      desiredRunners: Math.min(deterministicDesired, context.maxRunners),
      reason: 'AI unavailable; deterministic fallback',
      urgency: 'medium',
    };
  }
}

// ── Helpers ───────────────────────────────────────────────────

function parseFailureResponse(
  text: string,
  _runContext: string,
): CiFailureReport {
  const clean = text.replace(/^```(?:json)?\s*|\s*```$/g, '').trim();

  try {
    const parsed = JSON.parse(clean) as {
      failureClass?: string;
      confidence?: number;
      recommendation?: string;
      reasoning?: string;
      suggestedAction?: string;
    };

    const validClasses: ReadonlyArray<FailureClass> = [
      'known-flake',
      'infrastructure',
      'test-flake',
      'real-failure',
      'tooling-issue',
    ];

    const failureClass = validClasses.includes(
      parsed.failureClass as FailureClass,
    )
      ? (parsed.failureClass as FailureClass)
      : 'real-failure';

    const validRecs = ['retry', 'escalate', 'ignore', 'investigate'] as const;

    return {
      runId: 0,
      jobName: 'unknown',
      conclusion: 'failure',
      failureClass,
      confidence: Math.max(0, Math.min(1, parsed.confidence ?? 0.5)),
      recommendation: validRecs.includes(
        parsed.recommendation as (typeof validRecs)[number],
      )
        ? (parsed.recommendation as 'retry' | 'escalate' | 'ignore' | 'investigate')
        : 'retry',
      reasoning: parsed.reasoning ?? 'Parsed from AI response',
      suggestedAction: parsed.suggestedAction ?? 'Investigate',
    };
  } catch {
    return {
      runId: 0,
      jobName: 'unknown',
      conclusion: 'failure',
      failureClass: 'real-failure',
      confidence: 0.3,
      recommendation: 'retry',
      reasoning: 'Failed to parse AI response',
      suggestedAction: 'Retry and monitor',
    };
  }
}
