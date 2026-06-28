/**
 * Deterministic scorer bundle — single source of truth for CI + online lanes.
 */

import type { FailureMode } from '@/lib/eval/failure-modes';

import { scoreFormatPolicy } from './format-policy';
import { scoreLeakDetection } from './leak-detection';
import { scorePolicyAdherence } from './policy-adherence';
import { deriveRubricScoresFromDeterministic } from './rubric';
import { scoreSchemaFormat } from './schema-format';
import type {
  DeterministicScorerBundle,
  RubricCriterion,
  ScorerInput,
  ScorerResult,
  ScorerVerdict,
} from './types';

function mapFailureModes(results: readonly ScorerResult[]): FailureMode[] {
  const modes = new Set<FailureMode>();

  for (const result of results) {
    if (!result.flagged) continue;

    switch (result.criterion) {
      case 'leak-detection':
        modes.add('prompt-leak');
        break;
      case 'format-policy':
        modes.add('format-violation');
        break;
      case 'policy-adherence':
        modes.add('policy-violation');
        break;
      case 'schema-format':
        modes.add(
          result.verdict === 'soft-fail'
            ? 'tool-call-error'
            : 'format-violation'
        );
        break;
      default:
        break;
    }
  }

  return [...modes];
}

export function runDeterministicScorers(
  input: ScorerInput
): DeterministicScorerBundle {
  const results: ScorerResult[] = [
    scoreLeakDetection(input),
    scoreFormatPolicy(input),
    scorePolicyAdherence(input),
    scoreSchemaFormat(input),
  ];

  const flagged = results.some(result => result.flagged);
  const hardFailures = results.some(result => result.verdict === 'fail');

  return {
    results,
    passed: !hardFailures,
    flagged,
    failureModes: mapFailureModes(results),
  };
}

export function runAllScorers(
  input: ScorerInput & {
    readonly rubricScores?: Partial<Record<RubricCriterion, number>>;
  }
): {
  readonly deterministic: DeterministicScorerBundle;
  readonly rubric: readonly ScorerResult[];
  readonly all: readonly ScorerResult[];
  readonly flagged: boolean;
  readonly failureModes: readonly FailureMode[];
} {
  const deterministic = runDeterministicScorers(input);

  const rubric =
    input.rubricScores && Object.keys(input.rubricScores).length > 0
      ? (
          Object.entries(input.rubricScores) as Array<[RubricCriterion, number]>
        ).map(([criterion, rawScore]) => {
          const verdict: ScorerVerdict =
            rawScore >= 4 ? 'pass' : rawScore >= 3 ? 'soft-fail' : 'fail';

          return {
            criterion,
            verdict,
            score: rawScore,
            reason: `[${input.caseName}] ${criterion} judge score=${rawScore}`,
            flagged: rawScore < 4,
          };
        })
      : deriveRubricScoresFromDeterministic({
          caseName: input.caseName,
          deterministicPassed: deterministic.passed,
          leakPassed:
            deterministic.results.find(
              result => result.criterion === 'leak-detection'
            )?.verdict === 'pass',
          formatPassed:
            deterministic.results.find(
              result => result.criterion === 'format-policy'
            )?.verdict === 'pass',
          policyPassed:
            deterministic.results.find(
              result => result.criterion === 'policy-adherence'
            )?.verdict === 'pass',
        });

  const all = [...deterministic.results, ...rubric];
  const flagged = all.some(result => result.flagged);

  return {
    deterministic,
    rubric,
    all,
    flagged,
    failureModes: deterministic.failureModes,
  };
}
