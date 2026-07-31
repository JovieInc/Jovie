/**
 * Reconcile deterministic classifications against persisted machine comments.
 */

import * as classifier from './classifier.mjs';

export async function reconcileIssues({
  issues,
  client,
  isDryRun = false,
  backlogStateId = null,
}) {
  for (const issue of issues) {
    const stored = classifier.parseStoredClassification(issue);
    const c = classifier.classifyDeterministic(issue, issues);

    if (stored && stored.fp === c.fingerprint) {
      console.log(`  SKIP ${issue.identifier} — unchanged`);
      continue;
    }

    console.log(
      `  ${c.category}: ${issue.identifier} — ${(issue.title || '').slice(0, 50)}`
    );

    if (isDryRun) {
      console.log(
        `    (dry-run) would classify as ${c.category}, score ${c.valueScore}`
      );
      continue;
    }

    const commentBody = classifier.buildStoredClassification(c);
    try {
      await client.addComment(issue.id, commentBody);
    } catch (err) {
      console.error(`    Failed to add comment: ${err.message}`);
    }

    if (
      backlogStateId &&
      (c.category === 'duplicate' || c.category === 'obsolete')
    ) {
      try {
        await client.transitionIssue(issue.id, backlogStateId);
        console.log('    Moved to Backlog');
      } catch (err) {
        console.error(`    Failed to transition: ${err.message}`);
      }
    }
  }
}
