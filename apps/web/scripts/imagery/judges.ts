/**
 * Imagery judges, cheapest first. All model calls go through
 * packages/api-client (provider `cloudflare`, Workers AI) so the shared
 * per-credential daily cap and breaker apply; no Opus, no subscription CLI.
 *
 *   1. Clef (system-1 screenshot evaluator, DESIGN.md rules)   ~ $0.005 / image
 *   2. Cold screenshot test ("what's wrong with this?")         ~ $0.001 / image
 *   3. Dogfood taste rubric (imagery criteria only)             ~ $0.001 / image
 *
 * (2) and (3) are the dogfood judge's own prompts and verdict rules, reused
 * via dogfood-adapter.mjs, run on a Workers AI vision model.
 */
import { createApiClient } from '../../../../packages/api-client/client.ts';
import { providerSpec } from '../../../../packages/api-client/contract.ts';
import { hashCredential } from '../../../../packages/api-client/store.ts';
import {
  evaluateScreenshots,
  resolveWorkersAiAuth,
} from '../../../../scripts/invariants/clef-screenshot-evaluator.mjs';
import type { StageWaiver } from '../../lib/imagery/stages';
import {
  coldPrompt,
  parseCold,
  parseRubric,
  rubricPrompt,
} from './dogfood-adapter.mjs';
import type { JudgeFinding } from './verify-core';

export const VISION_MODEL = '@cf/mistralai/mistral-small-3.1-24b-instruct';
export const VISION_PRICE_USD = 0.001;
export const VISION_DAILY_CAP_USD = 1;

export interface Rubric {
  buildColdPrompt: (images: { name: string; path: string }[]) => string;
  parseColdOutput: (raw: unknown, names: string[]) => unknown[];
  coldFails: (issues: unknown[]) => boolean;
  CRITERIA: { id: string; slug: string }[];
  SEVERITIES: string[];
  stepVerdict: (findings: unknown[]) => string;
  [key: string]: unknown;
}

export async function callVision(
  prompt: string,
  png: Buffer
): Promise<Record<string, unknown>> {
  const auth = resolveWorkersAiAuth();
  const spec = providerSpec('cloudflare');
  const client = createApiClient({
    provider: 'cloudflare',
    credential: hashCredential('cloudflare', auth.token),
    authorize: headers => {
      headers.set('Authorization', `Bearer ${auth.token}`);
    },
    dailySpendCapUsd: VISION_DAILY_CAP_USD,
  });
  const res = await client.request({
    url: `https://${spec.hosts[0]}${spec.pathPrefix}accounts/${auth.accountId}/ai/run/${VISION_MODEL}`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: {
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            {
              type: 'image_url',
              image_url: {
                url: `data:image/png;base64,${png.toString('base64')}`,
              },
            },
          ],
        },
      ],
      max_tokens: 700,
      response_format: { type: 'json_object' },
    },
    priority: 'default',
    write: false,
    idempotent: true,
    maxAttempts: 2,
    maxWaitMs: 90_000,
    timeoutMs: 90_000,
    priceUsd: VISION_PRICE_USD,
  });
  const body = res.json() as {
    success?: boolean;
    result?: { choices?: { message?: { content?: string } }[] };
    errors?: { code?: number }[];
  } | null;
  if (res.status < 200 || res.status >= 300 || !body?.success) {
    throw new Error(
      `workers-ai-error-${body?.errors?.[0]?.code ?? res.status} (${VISION_MODEL})`
    );
  }
  const text = body.result?.choices?.[0]?.message?.content ?? '';
  return JSON.parse(text) as Record<string, unknown>;
}

export interface JudgeRun {
  readonly judge: string;
  readonly model: string;
  readonly findings: JudgeFinding[];
}

/** Clef: the system-1 screenshot evaluator over the marketing profile. */
export async function runClef(
  label: string,
  png: Buffer,
  waivers: readonly StageWaiver[] = []
): Promise<JudgeRun> {
  const receipt = await evaluateScreenshots([{ label, overview: png }], {
    profile: 'marketing',
    surface: 'imagery-stage',
  });
  if (receipt.status !== 'evaluated') {
    return {
      judge: 'clef',
      model: receipt.model,
      findings: [
        {
          source: 'clef',
          severity: 'blocker',
          detail: `clef did not evaluate (${receipt.status}${receipt.error ? `: ${receipt.error}` : ''})`,
        },
      ],
    };
  }
  return {
    judge: 'clef',
    model: receipt.model,
    findings: (receipt.failed ?? []).map((rule: string) => {
      const waiver = waivers.find(w => w.judge === 'clef' && w.rule === rule);
      return {
        source: 'clef',
        severity: 'major' as const,
        gate: !waiver,
        detail: waiver
          ? `clef rule ${rule} over threshold, waived: ${waiver.reason}`
          : `clef rule ${rule} over threshold`,
      };
    }),
  };
}

/** Cold screenshot test, then the dogfood imagery rubric, on one vision model. */
export async function runDogfood(
  rubric: Rubric | null,
  png: Buffer,
  call: typeof callVision = callVision
): Promise<JudgeRun> {
  if (!rubric) {
    return {
      judge: 'dogfood',
      model: 'unavailable',
      findings: [
        {
          source: 'dogfood',
          severity: 'blocker',
          detail:
            'dogfood judge rubric not found (scripts/dogfood-judge/rubric.mjs, PR #23746; or set DOGFOOD_JUDGE_RUBRIC)',
        },
      ],
    };
  }
  const findings: JudgeFinding[] = [];
  const cold = parseCold(rubric, await call(coldPrompt(rubric), png));
  for (const issue of cold.issues as {
    credible: boolean;
    severity: JudgeFinding['severity'];
    detail: string;
  }[]) {
    if (issue.credible && issue.severity !== 'minor') {
      findings.push({
        source: 'cold',
        severity: issue.severity,
        gate: issue.severity === 'blocker',
        detail: issue.detail,
      });
    }
  }
  const taste = parseRubric(rubric, await call(rubricPrompt(rubric), png));
  for (const finding of taste.findings as {
    id: string;
    severity: JudgeFinding['severity'];
    detail: string;
  }[]) {
    findings.push({
      source: finding.id,
      severity: finding.severity,
      gate: finding.severity === 'blocker',
      detail: finding.detail,
    });
  }
  return { judge: 'dogfood', model: VISION_MODEL, findings };
}
