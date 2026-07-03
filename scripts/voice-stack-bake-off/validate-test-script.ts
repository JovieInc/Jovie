import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';

const turnExpectSchema = z
  .object({
    acknowledgesArtist: z.boolean().optional(),
    asksClarifyingOrOffersHelp: z.boolean().optional(),
    maxResponseSentences: z.number().int().positive().optional(),
    mentionsReleasePlanning: z.boolean().optional(),
    shouldInvokeTool: z.string().optional(),
    toolCallRequired: z.string().optional(),
    mentionsDaysUntilDrop: z.number().int().optional(),
    mentionsTitle: z.string().optional(),
    handlesTopicShift: z.boolean().optional(),
    providesConcretePostIdea: z.boolean().optional(),
    doesNotHallucinateMetrics: z.boolean().optional(),
    gracefulClose: z.boolean().optional(),
    hangupOrEndCall: z.boolean().optional(),
  })
  .passthrough();

const bakeOffTestScriptSchema = z.object({
  version: z.string().min(1),
  issue: z.string().min(1),
  persona: z.object({
    name: z.string().min(1),
    role: z.string().min(1),
    voice: z.string().min(1),
    context: z.string().min(1),
  }),
  agentSystemPrompt: z.string().min(20),
  tools: z
    .array(
      z.object({
        name: z.string().min(1),
        description: z.string().min(1),
        parameters: z.record(z.unknown()),
        mockResponse: z.record(z.unknown()).optional(),
      })
    )
    .min(1),
  turns: z
    .array(
      z.object({
        turn: z.number().int().positive(),
        speaker: z.literal('caller'),
        utterance: z.string().min(1),
        interruption: z.boolean().optional(),
        expect: turnExpectSchema,
      })
    )
    .length(5),
  latencyMetrics: z.array(z.string().min(1)).min(1),
  humanJudgmentAxes: z.array(z.string().min(1)).min(1),
});

export type BakeOffTestScript = z.infer<typeof bakeOffTestScriptSchema>;

export function defaultTestScriptPath(): string {
  return resolve(import.meta.dirname, 'test-script.json');
}

export function loadBakeOffTestScript(
  path = defaultTestScriptPath()
): BakeOffTestScript {
  const raw = readFileSync(path, 'utf8');
  const parsed: unknown = JSON.parse(raw);
  return bakeOffTestScriptSchema.parse(parsed);
}

export function assertPinnedFiveTurnFlow(script: BakeOffTestScript): void {
  const turnNumbers = script.turns.map(t => t.turn);
  if (turnNumbers.join(',') !== '1,2,3,4,5') {
    throw new Error(
      `Expected turns 1–5 in order; got ${turnNumbers.join(',')}`
    );
  }
}
