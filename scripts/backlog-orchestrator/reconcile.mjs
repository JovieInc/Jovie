/**
 * Reconcile deterministic classifications against persisted machine comments.
 */

import * as classifier from './classifier.mjs';

export function buildReconcileReceipt({ issues, isDryRun, results }) {
  return {
    schema: 'backlog-orchestrator/reconcile/v1',
    mode: isDryRun ? 'dry-run' : 'mutating',
    issueCount: issues.length,
    classified: results.filter(r => r.action === 'classify').length,
    skipped: results.filter(r => r.action === 'skip').length,
    wouldMove: results.filter(r => r.wouldMove).length,
    mutations: isDryRun ? 0 : results.filter(r => r.mutated).length,
    results,
  };
}

export async function reconcileIssues({
  issues,
  client,
  isDryRun = false,
  backlogStateId = null,
}) {
  const results = [];
  for (const issue of issues) {
    const c = classifier.classifyDeterministic(issue, issues);
    const alreadyStored = classifier
      .parseStoredClassifications(issue)
      .some(entry => entry.fp === c.fingerprint);

    if (alreadyStored) {
      console.log(`  SKIP ${issue.identifier} — unchanged`);
      results.push({
        identifier: issue.identifier,
        fingerprint: c.fingerprint,
        action: 'skip',
        reason: 'fingerprint-unchanged',
      });
      continue;
    }

    console.log(
      `  ${c.category}: ${issue.identifier} — ${(issue.title || '').slice(0, 50)}`
    );
    const wouldMove = Boolean(
      backlogStateId &&
        (c.category === 'duplicate' || c.category === 'obsolete')
    );

    if (isDryRun) {
      console.log(
        `    (dry-run) would classify as ${c.category}, score ${c.valueScore}`
      );
      results.push({
        identifier: issue.identifier,
        fingerprint: c.fingerprint,
        action: 'classify',
        category: c.category,
        wouldMove,
        mutated: false,
      });
      continue;
    }

    const commentBody = classifier.buildStoredClassification(c);
    let mutated = false;
    try {
      const result = await client.addComment(issue.id, commentBody);
      if (
        result?.success === false ||
        result?.commentCreate?.success === false
      ) {
        throw new Error('classification-comment-mutation-failed');
      }
      mutated = true;
    } catch (err) {
      console.error(`    Failed to add comment: ${err.message}`);
    }

    if (mutated && wouldMove) {
      try {
        const result = await client.transitionIssue(issue.id, backlogStateId);
        if (
          result?.success === false ||
          result?.issueUpdate?.success === false
        ) {
          throw new Error('classification-transition-mutation-failed');
        }
        console.log('    Moved to Backlog');
      } catch (err) {
        console.error(`    Failed to transition: ${err.message}`);
      }
    }
    results.push({
      identifier: issue.identifier,
      fingerprint: c.fingerprint,
      action: 'classify',
      category: c.category,
      wouldMove,
      mutated,
    });
  }
  return buildReconcileReceipt({ issues, isDryRun, results });
}
