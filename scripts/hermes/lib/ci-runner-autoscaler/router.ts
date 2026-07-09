/**
 * Model router for the CI runner autoscaler.
 *
 * Uses the Vercel AI SDK (`ai` package) with `@ai-sdk/gateway` to route
 * AI decisions to the appropriate model based on task complexity and
 * subscription availability.
 *
 * Subscription chain (matching the fleet's model tiers):
 *   1. opencode-go/deepseek-v4-flash  — fast, cheap primary  (~$0.15/1M)
 *   2. ollama/qwen3-coder:30b         — local heavy (RTX 2080 Ti)
 *   3. openrouter/google/gemma-4-31b-it:free — free OpenRouter fallback
 *
 * Falls through on 401/402/429/5xx to the next tier.
 */

import { generateText } from 'ai';
import { createGateway, gateway as defaultGateway } from '@ai-sdk/gateway';
import {
  type CiFailureReport,
  type FailureClass,
  type ModelProfile,
  type ScalingRecommendation,
  type TaskRoute,
} from './types';

// ── Gateway configuration ──────────────────────────────────────

/**
 * Create a Vercel AI Gateway instance pointing to our gateway.
 * Falls back to the default discovery-based gateway if no URL is configured.
 */
function getGateway() {
  const gatewayUrl = process.env.AI_GATEWAY_URL;
  if (gatewayUrl) {
    return createGateway({ baseURL: gatewayUrl });
  }
  return defaultGateway;
}

// ── Model route definitions ───────────────────────────────────

/**
 * Model routing table, matching the fleet's subscription infrastructure.
 *
 * Format: `provider/model` (forward slash, matching Vercel AI SDK conventions).
 *
 * Tier 1: Fast paid — opencode-go/deepseek-v4-flash (~$0.15/1M)
 * Tier 2: Local heavy — ollama/qwen3-coder:30b (free, on RTX 2080 Ti)
 * Tier 3: Free fallback — openrouter/google/gemma-4-31b-it:free
 */
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

/**
 * Select a model route based on the task's complexity profile.
 */
export function selectRoute(
  need: 'classification' | 'analysis' | 'escalation'
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

// ── AI decision helpers (using Vercel AI SDK) ───────────────────

/**
 * Classify a CI failure using the model router.
 *
 * Returns a structured failure report with classification, confidence,
 * and recommendation.
 */
export async function classifyFailure(
  runContext: string
): Promise<CiFailureReport> {
  const route = selectRoute('classification');
  const gateway = getGateway();

  try {
    const { text } = await generateText({
      model: gateway(route.model),
      system: `You are an expert CI engineer analyzing a workflow run failure.

Classify the failure into exactly one of these categories:
- "known-flake" — A previously seen intermittent failure (timeout, network, resource exhaustion)
- "infrastructure" — CI infra issue (runner unavailable, Docker failure, disk full)
- "test-flake" — Test that fails intermittently without code changes (race condition, timing)
- "real-failure" — A genuine regression introduced by the code change
- "tooling-issue" — Build tool/linter/formatter/config problem

Respond with valid JSON only (no markdown, no explanation):
{
  "failureClass": "<category>",
  "confidence": <0.0-1.0>,
  "recommendation": "<retry|escalate|ignore|investigate>",
  "reasoning": "<one-line explanation>",
  "suggestedAction": "<what to do>"
}`,
      messages: [
        {
          role: 'user',
          content: runContext,
        },
      ],
      temperature: 0.1,
      maxTokens: 300,
    });

    return parseFailureResponse(text, runContext);
  } catch (primaryError) {
    // Fall back to simple model
    try {
      const { text } = await generateText({
        model: gateway(route.fallbackModel),
        system: 'Classify this CI failure as known-flake, infrastructure, test-flake, real-failure, or tooling-issue. Return JSON with failureClass (string), confidence (0-1), recommendation (retry|escalate|ignore|investigate).',
        messages: [{ role: 'user', content: runContext }],
        temperature: 0.1,
        maxTokens: 200,
      });
      return parseFailureResponse(text, runContext);
    } catch {
      // Last resort: safe default
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

/**
 * Determine optimal scaling decision based on queue state.
 */
export async function recommendScaling(
  context: {
    readonly queuedJobs: number;
    readonly activeRunners: number;
    readonly maxRunners: number;
    readonly recentFailures: number;
  }
): Promise<ScalingRecommendation> {
  const route = selectRoute('classification');
  const gateway = getGateway();

  // Deterministic baseline: scale to meet demand
  const demandRunners = Math.min(
    context.queuedJobs,
    context.maxRunners
  );
  const deterministicDesired = Math.max(
    demandRunners,
    context.activeRunners
  );

  // If no recent failures, skip AI and use deterministic
  if (context.recentFailures === 0) {
    return {
      desiredRunners: Math.min(deterministicDesired, context.maxRunners),
      reason: `Deterministic scale: ${context.queuedJobs} queued, ${context.activeRunners} active`,
      urgency: context.queuedJobs > context.activeRunners ? 'high' : 'low',
    };
  }

  // With recent failures, ask AI if we should be conservative
  try {
    const { text } = await generateText({
      model: gateway(route.model),
      system: `You are a CI autoscaler. Given the current queue state and recent failure rate, recommend the runner count. Consider being conservative if failures are high (to avoid wasting resources on flaky runs) and aggressive if queue is backlogged.

Return valid JSON:
{
  "desiredRunners": <number 1-N>,
  "reason": "<brief reason>",
  "urgency": "low|medium|high"
}`,
      messages: [
        {
          role: 'user',
          content: JSON.stringify(context),
        },
      ],
      temperature: 0.1,
      maxTokens: 200,
    });

    const parsed = JSON.parse(text) as ScalingRecommendation;
    return {
      desiredRunners: Math.max(1, Math.min(parsed.desiredRunners, context.maxRunners)),
      reason: parsed.reason ?? 'AI scaling recommendation',
      urgency: parsed.urgency ?? 'medium',
    };
  } catch {
    // Fall back to deterministic
    return {
      desiredRunners: Math.min(deterministicDesired, context.maxRunners),
      reason: `AI unavailable; deterministic fallback`,
      urgency: 'medium',
    };
  }
}

// ── Helpers ────────────────────────────────────────────────────

function parseFailureResponse(
  text: string,
  runContext: string
): CiFailureReport {
  // Strip markdown code fences if present
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
      parsed.failureClass as FailureClass
    )
      ? (parsed.failureClass as FailureClass)
      : 'real-failure';

    return {
      runId: 0,
      jobName: 'unknown',
      conclusion: 'failure',
      failureClass,
      confidence: Math.max(0, Math.min(1, parsed.confidence ?? 0.5)),
      recommendation: (
        ['retry', 'escalate', 'ignore', 'investigate'] as const
      ).includes(parsed.recommendation as 'retry' | 'escalate' | 'ignore' | 'investigate')
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
      reasoning: 'Failed to parse AI response; defaulting',
      suggestedAction: 'Retry and monitor',
    };
  }
}

export { getGateway };
