/**
 * Customer-digest copy gate (JOV-7447 follow-up).
 *
 * The digest renders at the jovie-marketing register on /changelog, where
 * seo:certify blocks on @jovie/copy findings. This gate lints the drafted
 * story copy at the publisher boundary, before the release PR is opened, so
 * the writer's repair loop rewords the copy instead of the merge queue
 * ejecting the release PR a day later.
 *
 * Lives outside the changelog guard's import closure on purpose: the trusted
 * base guard is extracted from a scripts-only git archive, so nothing it
 * loads may import outside scripts/ (the #25182 Source Validation lesson).
 */
import { lintCopy } from '../../packages/copy/lint.ts';

/** Rules the writer's repair loop should reword rather than waive. */
export function lintDailyDigestStories(stories) {
  const findings = [];
  const seen = new Set();
  for (const story of Array.isArray(stories) ? stories : []) {
    const spans = [
      { text: story?.summary, id: story?.id ?? '(unnamed)' },
      ...(Array.isArray(story?.bullets) ? story.bullets : []).map(
        (bullet, index) => ({
          text: typeof bullet === 'string' ? bullet : bullet?.text,
          id: `${story?.id ?? '(unnamed)'}#${index}`,
        })
      ),
    ];
    for (const [index, span] of spans.entries()) {
      if (typeof span.text !== 'string') continue;
      for (const finding of lintCopy(span.text, {
        register: 'jovie-marketing',
      }).blocking) {
        const key = `${finding.rule}:${finding.match}`;
        if (seen.has(key)) continue;
        seen.add(key);
        findings.push({
          rule: 'draft-copy-lint',
          storyId: span.id,
          span: index,
          lint: finding.rule,
          match: finding.match,
          message: `Story ${span.id} copy fails @jovie/copy ${finding.rule} ("${finding.match}"): ${finding.message}`,
        });
      }
    }
  }
  return findings;
}
