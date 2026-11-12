/**
 * Daily-changelog draft span validation (JOV-7447 follow-up).
 *
 * Claim, fact and copy checks over one drafted story's spans (summary plus
 * bullets). Extracted from daily-changelog.mjs so the evaluator file stays
 * within its size-500 budget while drafts are still linted with @jovie/copy
 * before publication: a span the jovie-marketing register blocks (an em dash,
 * for example) now fails validation at the writer's own output instead of
 * ejecting the release PR from the merge queue on seo:certify copy:copy-lint.
 */
import { lintCopy } from '../../packages/copy/lint.ts';

const NUMBER_TOKEN_RE = /\d[\d.,%x-]*/g;

export function validateDailyDraftSpans(
  spans,
  { draftId, prefix, approvedClaims, approvedFacts }
) {
  const findings = [];
  const lintedCopyKeys = new Set();
  for (const span of spans) {
    if (span.claimIds.length === 0) {
      findings.push({
        rule: 'unmapped-claim',
        storyId: draftId,
        message: `${prefix} has copy with no approved claim mapping.`,
      });
    }
    for (const claimId of span.claimIds) {
      if (!approvedClaims.has(claimId)) {
        findings.push({
          rule: 'unsupported-claim',
          storyId: draftId,
          message: `${prefix} cites claim ${claimId}, which no mapped source approved.`,
        });
      }
    }
    for (const token of span.text.match(NUMBER_TOKEN_RE) ?? []) {
      if (!approvedFacts.includes(token)) {
        findings.push({
          rule: 'unsupported-fact',
          storyId: draftId,
          message: `${prefix} states "${token}", which no mapped source approved as a fact.`,
        });
      }
    }
    for (const copyFinding of lintCopy(span.text, {
      register: 'jovie-marketing',
    }).blocking) {
      const key = `${copyFinding.rule}:${copyFinding.match}`;
      if (lintedCopyKeys.has(key)) continue;
      lintedCopyKeys.add(key);
      findings.push({
        rule: 'draft-copy-lint',
        storyId: draftId,
        message: `${prefix} copy fails @jovie/copy ${copyFinding.rule} ("${copyFinding.match}"): ${copyFinding.message}`,
      });
    }
  }
  return findings;
}
