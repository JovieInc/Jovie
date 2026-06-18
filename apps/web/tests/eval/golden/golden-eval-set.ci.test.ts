/**
 * Golden eval-set CI gate — deterministic quality regression checks.
 *
 * Uses mocked LLM responses so CI can block AI feature deploys without paid
 * provider calls. Live provider grading stays in knowledge-accuracy.eval.ts.
 *
 * Run:
 *   pnpm --filter @jovie/web run evals:golden
 */

import { tool as aiTool, generateText } from 'ai';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { selectKnowledgeContext } from '@/lib/chat/knowledge/router';
import { buildSystemPrompt } from '@/lib/chat/system-prompt';
import { TOOL_SCHEMAS } from '@/lib/chat/tool-schemas';
import { CHAT_MODEL } from '@/lib/constants/ai-models';
import {
  buildTestArtistContext,
  buildTestReleases,
} from '../../fixtures/chat-context';
import { assertGoldenCaseQuality } from './assertions';
import { GOLDEN_CASES } from './cases';
import {
  assertGoldenMockCoverage,
  getGoldenMockResponse,
} from './mock-responses';

const mockGenerateText = vi.fn();

vi.mock('ai', async () => {
  const actual = await vi.importActual<typeof import('ai')>('ai');
  return {
    ...actual,
    generateText: (...args: Parameters<typeof generateText>) =>
      mockGenerateText(...args),
  };
});

vi.mock('@ai-sdk/gateway', () => ({
  gateway: vi.fn((modelId: string) => ({ __model: modelId })),
}));

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

describe('Golden eval-set CI gate', () => {
  const evalTools = buildEvalTools();

  beforeAll(() => {
    assertGoldenMockCoverage();
  });

  it('has deterministic mock coverage for every golden case', () => {
    expect(GOLDEN_CASES.length).toBeGreaterThan(0);
    for (const golden of GOLDEN_CASES) {
      expect(getGoldenMockResponse(golden.name)).toBeTypeOf('string');
    }
  });

  for (const golden of GOLDEN_CASES) {
    it(`passes quality bar: ${golden.name}`, async () => {
      mockGenerateText.mockResolvedValueOnce({
        text: getGoldenMockResponse(golden.name),
      });

      const artistContext = buildTestArtistContext(golden.artistOverrides);
      const releases = buildTestReleases(golden.releaseOverrides);
      const knowledgeContext = selectKnowledgeContext(golden.userPrompt);

      const systemPrompt = buildSystemPrompt(artistContext, releases, {
        aiCanUseTools: true,
        aiDailyMessageLimit: 50,
        knowledgeContext: knowledgeContext || undefined,
      });

      const result = await generateText({
        model: { __model: CHAT_MODEL },
        system: systemPrompt,
        prompt: golden.userPrompt,
        tools: evalTools,
        maxOutputTokens: 500,
        temperature: 0,
      });

      expect(mockGenerateText).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: golden.userPrompt,
          system: systemPrompt,
        })
      );

      assertGoldenCaseQuality(result.text, golden);
    });
  }

  it('blocks degraded responses that violate the golden quality bar', () => {
    const degraded =
      'Release on Monday. Any day works equally well for streams.';

    expect(() => assertGoldenCaseQuality(degraded, GOLDEN_CASES[0])).toThrow();
  });
});
