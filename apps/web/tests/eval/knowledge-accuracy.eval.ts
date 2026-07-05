/**
 * Knowledge Accuracy Eval — Founder Judgment Capture
 *
 * Tests the Jovie AI chat for music industry knowledge accuracy.
 * Each golden case encodes the founder's domain expertise as deterministic
 * must-say / must-not-say / harmful-blacklist checks.
 *
 * Run: doppler run -- pnpm vitest run tests/eval/knowledge-accuracy.eval.ts
 *
 * Cost: ~$0.30-0.50 per run (real Anthropic API calls).
 * Time: ~3-5 minutes for all cases.
 */

import { gateway } from '@ai-sdk/gateway';
import { tool as aiTool, generateText } from 'ai';
import { describe, it } from 'vitest';
import { selectKnowledgeContext } from '@/lib/chat/knowledge/router';
import { buildSystemPrompt } from '@/lib/chat/system-prompt';
import { TOOL_SCHEMAS } from '@/lib/chat/tool-schemas';
import { CHAT_MODEL } from '@/lib/constants/ai-models';
import {
  buildTestArtistContext,
  buildTestReleases,
} from '../fixtures/chat-context';
import { assertGoldenCaseQuality } from './golden/assertions';
import { GOLDEN_CASES } from './golden/cases';

const EVAL_MODEL = CHAT_MODEL;
const CASE_TIMEOUT_MS = 30_000;

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

describe('Knowledge Accuracy Eval — Golden Cases', () => {
  const evalTools = buildEvalTools();

  for (const golden of GOLDEN_CASES) {
    it(
      golden.name,
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
          model: gateway(EVAL_MODEL),
          system: systemPrompt,
          prompt: golden.userPrompt,
          tools: evalTools,
          maxOutputTokens: 500,
          temperature: 0,
        });

        assertGoldenCaseQuality(result.text, golden);
      },
      CASE_TIMEOUT_MS
    );
  }
});
