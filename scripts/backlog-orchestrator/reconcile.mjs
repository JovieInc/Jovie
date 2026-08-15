/**
 * Reconcile deterministic classifications against persisted machine comments.
 */

import * as classifier from './classifier.mjs';
import { routeTriageIssue } from './triage-router.mjs';

export function buildReconcileReceipt({ issues, isDryRun, results }) {
  return {
    schema: 'backlog-orchestrator/reconcile/v1',
    mode: isDryRun ? 'dry-run' : 'mutating',
    issueCount: issues.length,
    classified: results.filter(r => r.action === 'classify').length,
    skipped: results.filter(r => r.action === 'skip').length,
    wouldMove: results.filter(r => r.wouldMove).length,
    mutations: isDryRun ? 0 : results.filter(r => r.mutated).length,
    routed: results.filter(r => r.wouldMove).length,
    failed: results.filter(r => r.errors?.length > 0).length,
    results,
  };
}

export async function reconcileIssues({
  issues,
  client,
  isDryRun = false,
  backlogStateId = null,
  todoStateId = null,
}) {
  const results = [];
  for (const issue of issues) {
    const c = classifier.classifyDeterministic(issue, issues);
    const alreadyStored = classifier
      .parseStoredClassifications(issue)
      .some(entry => entry.fp === c.fingerprint);
    const route = routeTriageIssue(issue, c, { backlogStateId, todoStateId });
    const wouldMove = Boolean(
      route.desiredStateId && route.desiredStateId !== issue.state?.id
    );
    const wouldAttachParent = Boolean(
      route.parentIdentifier && !issue.parent?.identifier
    );

    if (alreadyStored && !wouldMove && !wouldAttachParent) {
      console.log(`  SKIP ${issue.identifier} — unchanged`);
      results.push({
        identifier: issue.identifier,
        fingerprint: c.fingerprint,
        action: 'skip',
        reason: 'fingerprint-unchanged',
        route: route.reason,
      });
      continue;
    }

    console.log(
      `  ${c.category}: ${issue.identifier} — ${(issue.title || '').slice(0, 50)}`
    );
    if (isDryRun) {
      console.log(
        `    (dry-run) would classify as ${c.category}, score ${c.valueScore}`
      );
      results.push({
        identifier: issue.identifier,
        fingerprint: c.fingerprint,
        action: 'classify',
        category: route.category,
        route: route.reason,
        wouldMove,
        wouldAttachParent,
        mutated: false,
      });
      continue;
    }

    const commentBody = classifier.buildStoredClassification(c);
    let mutated = false;
    const errors = [];
    if (!alreadyStored) {
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
        errors.push(err.message);
      }
    }

    if (wouldAttachParent) {
      try {
        const parent = await client.fetchIssue(route.parentIdentifier);
        if (!parent) throw new Error('followup-parent-not-found');
        const result = await client.setIssueParent(issue.id, parent.id);
        if (
          result?.success === false ||
          result?.issueUpdate?.success === false
        ) {
          throw new Error('followup-parent-mutation-failed');
        }
        mutated = true;
      } catch (err) {
        console.error(`    Failed to attach parent: ${err.message}`);
        errors.push(err.message);
      }
    }

    if (wouldMove) {
      try {
        const result = await client.transitionIssue(
          issue.id,
          route.desiredStateId
        );
        if (
          result?.success === false ||
          result?.issueUpdate?.success === false
        ) {
          throw new Error('classification-transition-mutation-failed');
        }
        console.log(`    Routed via ${route.reason}`);
        mutated = true;
      } catch (err) {
        console.error(`    Failed to transition: ${err.message}`);
        errors.push(err.message);
      }
    }
    results.push({
      identifier: issue.identifier,
      fingerprint: c.fingerprint,
      action: 'classify',
      category: route.category,
      route: route.reason,
      wouldMove,
      wouldAttachParent,
      mutated,
      errors,
    });
  }
  return buildReconcileReceipt({ issues, isDryRun, results });
}
