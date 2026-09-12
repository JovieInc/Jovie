/**
 * Reconcile deterministic classifications against persisted machine comments.
 */

import * as classifier from './classifier.mjs';
import { routeTriageIssue, triageOwnershipDecision } from './triage-router.mjs';

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

// Comments/updatedAt change when our own classification is persisted. Everything
// that can change the planned route or owner must still match before each write.
function routingSnapshot(issue) {
  return JSON.stringify([
    issue.id,
    issue.identifier,
    issue.title,
    issue.description,
    issue.priority,
    issue.state,
    issue.assignee,
    issue.labels,
    issue.parent,
    issue.children,
    issue.relations,
    issue.project,
  ]);
}

function stored(issue, fingerprint) {
  return classifier
    .parseStoredClassifications(issue)
    .some(entry => entry.fp === fingerprint);
}

function assertMutation(result) {
  if (
    result?.success === false ||
    result?.commentCreate?.success === false ||
    result?.issueUpdate?.success === false ||
    result === false
  ) {
    throw new Error('reconciliation-mutation-failed');
  }
}

export async function reconcileIssues({
  issues,
  client,
  isDryRun = false,
  backlogStateId = null,
  todoStateId = null,
}) {
  const results = [];
  for (const snapshot of issues) {
    let issue = snapshot;
    const c = classifier.classifyDeterministic(issue, issues);
    const route = routeTriageIssue(issue, c, { backlogStateId, todoStateId });
    const ownership = triageOwnershipDecision(issue);
    const result = {
      identifier: issue.identifier,
      fingerprint: c.fingerprint,
      action: 'classify',
      category: route.category,
      route: route.reason,
      wouldMove: Boolean(
        route.desiredStateId && route.desiredStateId !== issue.state?.id
      ),
      wouldAttachParent: Boolean(
        route.parentIdentifier && !issue.parent?.identifier
      ),
      mutated: false,
      errors: [],
    };
    results.push(result);
    if (!ownership.allowed) {
      Object.assign(result, { action: 'skip', reason: ownership.reason });
      continue;
    }
    if (
      stored(issue, c.fingerprint) &&
      !result.wouldMove &&
      !result.wouldAttachParent
    ) {
      Object.assign(result, {
        action: 'skip',
        reason: 'fingerprint-unchanged',
      });
      continue;
    }
    if (isDryRun) continue;

    // No snapshot fallback: missing/error/changed ownership is not permission.
    // This closes stale-read races; Linear offers no transaction with the other
    // owner's lease, so the canonical admission writer must retain its own fence.
    const refresh = async () => {
      const current = await client.fetchIssue(issue.identifier);
      if (
        !current ||
        current.id !== issue.id ||
        current.identifier !== issue.identifier
      ) {
        throw new Error('ownership-readback-missing-or-mismatched');
      }
      const decision = triageOwnershipDecision(current);
      if (!decision.allowed) throw new Error(decision.reason);
      if (routingSnapshot(current) !== routingSnapshot(issue)) {
        throw new Error('reconciliation-snapshot-changed');
      }
      issue = current;
    };

    try {
      await refresh();
      if (!stored(issue, c.fingerprint)) {
        assertMutation(
          await client.addComment(
            issue.id,
            classifier.buildStoredClassification(c)
          )
        );
        result.mutated = true;
      }
      if (result.wouldAttachParent) {
        const parent = await client.fetchIssue(route.parentIdentifier);
        if (!parent) throw new Error('followup-parent-not-found');
        // Parent resolution is a read gap during which this issue may be claimed.
        await refresh();
        assertMutation(await client.setIssueParent(issue.id, parent.id));
        result.mutated = true;
        issue = {
          ...issue,
          parent: {
            id: parent.id,
            identifier: parent.identifier,
            title: parent.title,
          },
        };
      }
      if (result.wouldMove) {
        await refresh();
        assertMutation(
          await client.transitionIssue(issue.id, route.desiredStateId)
        );
        result.mutated = true;
      }
    } catch (error) {
      result.errors.push(error.message);
      result.reason = error.message;
    }
  }
  return buildReconcileReceipt({ issues, isDryRun, results });
}
