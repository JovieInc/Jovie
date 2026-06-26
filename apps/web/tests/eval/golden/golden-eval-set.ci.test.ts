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
import { buildReferencedEntitiesBlock } from '@/lib/chat/entity-hydration';
import { selectKnowledgeContext } from '@/lib/chat/knowledge/router';
import { buildSystemPrompt } from '@/lib/chat/system-prompt';
import { serializeEntity } from '@/lib/chat/tokens';
import { TOOL_SCHEMAS } from '@/lib/chat/tool-schemas';
import type { ReleaseContext } from '@/lib/chat/types';
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

/**
 * Entity hydration golden case (JOV-3537).
 *
 * Regression guard: when a user message carries an `@release` token for an
 * asset in the artist's own catalog, the server must hydrate that token into
 * the system prompt as the user's OWN release. Before the fix the model only
 * saw the bare `[label]` and mis-attributed the song to "another artist".
 */
describe('Golden eval-set CI gate: referenced-entity hydration', () => {
  const evalTools = buildEvalTools();

  const OWNED_RELEASE: ReleaseContext = {
    id: 'rel_revival_001',
    title: 'Revival',
    releaseType: 'single',
    releaseDate: '2025-08-22T00:00:00Z',
    artworkUrl: null,
    spotifyPopularity: 38,
    totalTracks: 1,
    canvasStatus: 'not_set',
    metadata: null,
  };

  const artistContext = buildTestArtistContext();
  const releases = buildTestReleases();

  // The wire string the composer sends: bare label + opaque entity token.
  const releaseToken = serializeEntity({
    kind: 'release',
    id: OWNED_RELEASE.id,
    label: OWNED_RELEASE.title,
  });
  const userPrompt = `How is ${releaseToken} doing? Should I pitch it again?`;

  function buildPromptWithReferencedEntities(): string {
    const referencedEntities = buildReferencedEntitiesBlock({
      userTexts: [userPrompt],
      ownedReleases: [OWNED_RELEASE],
      artist: {
        displayName: artistContext.displayName,
        username: artistContext.username,
      },
    });

    return buildSystemPrompt(artistContext, releases, {
      aiCanUseTools: true,
      aiDailyMessageLimit: 50,
      knowledgeContext: selectKnowledgeContext(userPrompt) || undefined,
      referencedEntities,
    });
  }

  it('injects the owned release into the system prompt as the user own catalog', () => {
    const systemPrompt = buildPromptWithReferencedEntities();

    expect(systemPrompt).toContain('Referenced Entities');
    // Hydrated facts the model can rely on: title, role (single), and the
    // explicit "own catalog" framing.
    expect(systemPrompt).toContain('"Revival"');
    expect(systemPrompt).toContain('single');
    expect(systemPrompt.toLowerCase()).toContain("this artist's own catalog");
    expect(systemPrompt.toLowerCase()).toContain('never another artist');
  });

  it('produces a reply that treats the owned release as the user own work', async () => {
    const systemPrompt = buildPromptWithReferencedEntities();

    // The mock reply represents the quality bar given the hydrated prompt:
    // it uses the resolved title/role and never disclaims it as someone else's.
    const reply =
      'Revival, your single, is at moderate popularity. Pitching it again to editorial is worth a shot now that it has some traction.';

    mockGenerateText.mockResolvedValueOnce({ text: reply });

    const result = await generateText({
      model: { __model: CHAT_MODEL },
      system: systemPrompt,
      prompt: userPrompt,
      tools: evalTools,
      maxOutputTokens: 500,
      temperature: 0,
    });

    const lower = result.text.toLowerCase();
    // Reflects correct catalog facts.
    expect(lower).toContain('revival');
    expect(lower).toContain('single');
    // Never mis-attributes the owned release to another artist.
    expect(lower).not.toContain('another artist');
    expect(lower).not.toContain("another artist's");
    expect(lower).not.toContain("someone else's");
    expect(lower).not.toContain('not your');
  });
});
