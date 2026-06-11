import type { StepResult, ToolSet } from 'ai';
import { describe, expect, it } from 'vitest';
import { resolveImportBioRestrictedTools } from './import-bio-turn-guard';

function makeStep(toolName: string, output: unknown): StepResult<ToolSet> {
  return {
    stepNumber: 0,
    model: { provider: 'test', modelId: 'test' },
    functionId: undefined,
    metadata: undefined,
    experimental_context: undefined,
    content: [],
    text: '',
    reasoning: [],
    reasoningText: undefined,
    files: [],
    sources: [],
    toolCalls: [],
    staticToolCalls: [],
    dynamicToolCalls: [],
    toolResults: [
      {
        type: 'tool-result',
        toolCallId: 'call-1',
        toolName,
        input: {},
        output,
      },
    ],
    staticToolResults: [],
    dynamicToolResults: [],
    finishReason: 'tool-calls',
    rawFinishReason: undefined,
    usage: {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
    },
    warnings: undefined,
    request: {},
    response: {
      id: 'resp-1',
      timestamp: new Date(),
      modelId: 'test',
      messages: [],
    },
    providerMetadata: undefined,
  } as unknown as StepResult<ToolSet>;
}

describe('resolveImportBioRestrictedTools', () => {
  it('returns undefined on the first step', () => {
    expect(resolveImportBioRestrictedTools([], 0)).toBeUndefined();
  });

  it('restricts to proposeProfileEdit after successful import', () => {
    const steps = [makeStep('importBioFromUrl', { ok: true })];
    expect(resolveImportBioRestrictedTools(steps, 1)).toEqual([
      'proposeProfileEdit',
    ]);
  });

  it('does not restrict after failed import', () => {
    const steps = [makeStep('importBioFromUrl', { ok: false })];
    expect(resolveImportBioRestrictedTools(steps, 1)).toBeUndefined();
  });
});
