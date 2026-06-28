/**
 * Schema/format scorer — basic response-shape checks for prod traces.
 */

import type { ScorerInput, ScorerResult } from './types';

export function scoreSchemaFormat(input: ScorerInput): ScorerResult {
  const { assistantResponse: response, caseName } = input;
  const trimmed = response.trim();

  if (!trimmed) {
    return {
      criterion: 'schema-format',
      verdict: 'fail',
      score: 0,
      reason: `[${caseName}] Assistant response is empty`,
      flagged: true,
    };
  }

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      JSON.parse(trimmed);
    } catch {
      return {
        criterion: 'schema-format',
        verdict: 'soft-fail',
        score: 0.5,
        reason: `[${caseName}] Response looks like JSON but failed to parse`,
        flagged: true,
      };
    }
  }

  return {
    criterion: 'schema-format',
    verdict: 'pass',
    score: 1,
    reason: `[${caseName}] Response format is valid`,
    flagged: false,
  };
}
