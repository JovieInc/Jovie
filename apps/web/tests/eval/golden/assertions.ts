import { expect } from 'vitest';

import { runDeterministicScorers } from '@/lib/eval/scorers/core';

import type { GoldenCase } from './cases';

export function assertGoldenCaseQuality(
  response: string,
  golden: GoldenCase
): void {
  const scored = runDeterministicScorers({
    caseName: golden.name,
    userPrompt: golden.userPrompt,
    assistantResponse: response,
    mustSay: golden.mustSay,
    mustNotSay: golden.mustNotSay,
    harmfulBlacklist: golden.harmfulBlacklist,
    voiceException: golden.voiceException ?? false,
    mustNotLeakPrompt: true,
  });

  for (const result of scored.results) {
    if (result.verdict === 'fail') {
      throw new Error(result.reason);
    }
  }

  expect(scored.passed).toBe(true);
}
