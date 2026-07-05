/**
 * Golden eval-set real-model lane (JOV-3659).
 *
 * Calls the live chat model through Helicone + Vercel AI Gateway with batch
 * size 1. Samples N=5 golden cases and reports pass-count range telemetry.
 *
 * Run (manual):
 *   JOVIE_RUN_REAL_MODEL_EVALS=1 doppler run -- pnpm --filter @jovie/web exec vitest run \
 *     --config lib/eval/adversarial/vitest.config.real-eval.mts
 */

import { createGateway } from '@ai-sdk/gateway';
import { tool as aiTool, generateText } from 'ai';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { selectKnowledgeContext } from '@/lib/chat/knowledge/router';
import { buildSystemPrompt } from '@/lib/chat/system-prompt';
import { TOOL_SCHEMAS } from '@/lib/chat/tool-schemas';
import { CHAT_MODEL } from '@/lib/constants/ai-models';
import {
  ADVERSARIAL_CASES,
  assertAdversarialCaseQuality,
  buildRangeReport,
  createHeliconeGateway,
  EvalBudgetTracker,
  formatRangeReport,
  isRealModelEvalEnabled,
  parseBudgetCapUsd,
  parseMinPassCount,
  parseSampleSize,
  selectDeterministicSample,
} from '@/lib/eval/adversarial';
import {
  buildTestArtistContext,
  buildTestReleases,
} from '../../fixtures/chat-context';
import { assertGoldenCaseQuality } from './assertions';
import { GOLDEN_CASES } from './cases';

const REAL_EVAL_ENABLED = isRealModelEvalEnabled();
const SAMPLE_SIZE = parseSampleSize(process.env.REAL_EVAL_SAMPLE_SIZE, 5);
const MIN_PASS = parseMinPassCount(SAMPLE_SIZE, process.env.REAL_EVAL_MIN_PASS);
const CASE_TIMEOUT_MS = 45_000;
const BATCH_SIZE = 1;

const goldenResults: boolean[] = [];
const adversarialResults: boolean[] = [];
let budgetTracker: EvalBudgetTracker | null = null;
let evalGateway: ReturnType<typeof createGateway> | null = null;

function buildEvalTools() {
  const tools: Record<string, ReturnType<typeof aiTool>> = {};
  for (const [name, schema] of Object.entries(TOOL_SCHEMAS)) {
    tools[name] = aiTool({
      description: schema.description,
      inputSchema: schema.inputSchema,
    } as never);
  }
  return tools;
}

function recordBudget(
  usage: { inputTokens?: number; outputTokens?: number } | undefined
): void {
  if (!budgetTracker) return;
  budgetTracker.recordUsage(usage?.inputTokens ?? 0, usage?.outputTokens ?? 0);
  budgetTracker.assertWithinBudget('real-model eval');
}

describe.skipIf(!REAL_EVAL_ENABLED)(
  'Golden eval-set real-model lane (Helicone)',
  () => {
    const evalTools = buildEvalTools();
    const sampledGoldenCases = selectDeterministicSample(
      GOLDEN_CASES,
      SAMPLE_SIZE
    );

    beforeAll(() => {
      evalGateway = createHeliconeGateway();
      budgetTracker = new EvalBudgetTracker(
        parseBudgetCapUsd(process.env.BUDGET_CAP_USD)
      );
      expect(BATCH_SIZE).toBe(1);
      expect(sampledGoldenCases.length).toBe(SAMPLE_SIZE);
    });

    for (const golden of sampledGoldenCases) {
      it(
        `passes quality bar: ${golden.name}`,
        async () => {
          const artistContext = buildTestArtistContext(golden.artistOverrides);
          const releases = buildTestReleases(golden.releaseOverrides);
          const knowledgeContext = selectKnowledgeContext(golden.userPrompt);

          const systemPrompt = buildSystemPrompt(artistContext, releases, {
            aiCanUseTools: true,
            aiDailyMessageLimit: 50,
            knowledgeContext: knowledgeContext || undefined,
          });

          const result = await generateText({
            model: evalGateway!(CHAT_MODEL),
            system: systemPrompt,
            prompt: golden.userPrompt,
            tools: evalTools,
            maxOutputTokens: 500,
            temperature: 0,
          });

          recordBudget(result.usage);

          try {
            assertGoldenCaseQuality(result.text, golden);
            goldenResults.push(true);
          } catch (error) {
            goldenResults.push(false);
            throw error;
          }
        },
        CASE_TIMEOUT_MS
      );
    }

    afterAll(() => {
      const report = buildRangeReport(
        'golden',
        goldenResults,
        SAMPLE_SIZE,
        MIN_PASS
      );
      console.log(formatRangeReport(report));
      expect(report.withinRange).toBe(true);
    });
  }
);

describe.skipIf(!REAL_EVAL_ENABLED)(
  'Adversarial input battery (Helicone)',
  () => {
    const evalTools = buildEvalTools();
    const artistContext = buildTestArtistContext();
    const releases = buildTestReleases();

    beforeAll(() => {
      evalGateway ??= createHeliconeGateway();
      if (!budgetTracker) {
        budgetTracker = new EvalBudgetTracker(
          parseBudgetCapUsd(process.env.BUDGET_CAP_USD)
        );
      }
    });

    for (const adversarial of ADVERSARIAL_CASES) {
      it(
        `resists adversarial input: ${adversarial.name}`,
        async () => {
          const systemPrompt = buildSystemPrompt(artistContext, releases, {
            aiCanUseTools: true,
            aiDailyMessageLimit: 50,
          });

          const result = await generateText({
            model: evalGateway!(CHAT_MODEL),
            system: systemPrompt,
            prompt: adversarial.userPrompt,
            tools: evalTools,
            maxOutputTokens: 500,
            temperature: 0,
          });

          recordBudget(result.usage);

          try {
            assertAdversarialCaseQuality(result.text, adversarial);
            adversarialResults.push(true);
          } catch (error) {
            adversarialResults.push(false);
            throw error;
          }
        },
        CASE_TIMEOUT_MS
      );
    }

    afterAll(() => {
      const minPass = parseMinPassCount(
        ADVERSARIAL_CASES.length,
        process.env.REAL_EVAL_ADVERSARIAL_MIN_PASS
      );
      const report = buildRangeReport(
        'adversarial',
        adversarialResults,
        ADVERSARIAL_CASES.length,
        minPass
      );
      console.log(formatRangeReport(report));
      expect(report.withinRange).toBe(true);
    });
  }
);

describe('Golden eval-set real-model lane (disabled guard)', () => {
  it('skips live provider calls unless JOVIE_RUN_REAL_MODEL_EVALS is enabled', () => {
    if (REAL_EVAL_ENABLED) {
      expect(process.env.JOVIE_RUN_REAL_MODEL_EVALS).toBe('1');
      return;
    }

    expect(process.env.JOVIE_RUN_REAL_MODEL_EVALS).not.toBe('1');
  });
});
