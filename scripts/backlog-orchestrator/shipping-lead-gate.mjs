/** Bind one Summer request to the existing canonical admission pipeline. */

import { validateShippingTask } from '../symphony/summer-shipping-lead-contract.mjs';
import { issueContentHash } from './context-gate.mjs';

/**
 * Admission is not owner execution acceptance or a terminal outcome. The caller
 * must durably record mutation intent before invoking any canonical mutation.
 */
export async function gateShippingLeadRequest(
  task,
  {
    client,
    preflight,
    evaluate,
    team,
    beforeMutation = null,
    dryRun = false,
    now = Date.now,
  }
) {
  validateShippingTask(task);
  const held = reason => ({ status: 'held', reason });
  if (team?.key !== 'JOV') return held('shipping-lead-team-mismatch');
  if (!dryRun && typeof beforeMutation !== 'function')
    return held('shipping-lead-mutation-journal-unavailable');
  const fresh = () =>
    Date.parse(task.createdAt) <= now() + 60_000 &&
    Date.parse(task.expiresAt) > now();
  if (!fresh()) return held('shipping-lead-request-expired-or-future');
  const issue = await client.fetchIssue(task.issue.identifier);
  if (
    issue?.id !== task.issue.id ||
    issue?.identifier !== task.issue.identifier ||
    issue?.updatedAt !== task.issue.revision ||
    issue?.state?.name !== 'Triage' ||
    issue?.assignee !== null
  )
    return held('shipping-lead-issue-changed-or-owned');
  const contentHash = issueContentHash(issue);
  let transitioned = false;
  const recheck = async () => {
    if (!fresh()) throw new Error('shipping-lead-request-expired-or-future');
    const current = await client.fetchIssue(task.issue.identifier);
    if (
      current?.id !== task.issue.id ||
      current?.identifier !== task.issue.identifier ||
      current?.assignee !== null ||
      issueContentHash(current) !== contentHash ||
      current?.state?.name !== (transitioned ? 'Todo' : 'Triage')
    )
      throw new Error('shipping-lead-issue-changed-or-owned');
    return current;
  };
  const capacity = async () => {
    const current = await recheck();
    const result = await preflight(team, current, {
      excludeIssueId: transitioned ? task.issue.id : null,
    });
    // Preserve the existing measured fleet/lane capacity; three is an extra cap.
    if (
      !result?.open ||
      !Number.isInteger(result.load?.count) ||
      result.load.count >= 3
    )
      throw new Error(result?.reason || 'shipping-lead-capacity-unavailable');
    return result;
  };
  let first;
  try {
    first = await capacity();
  } catch (error) {
    return held(error.message);
  }
  const mutate = async (method, id, value) => {
    if (dryRun) throw new Error('shipping-lead-dry-run-mutation');
    if (
      id !== task.issue.id ||
      (method === 'transitionIssue' && value !== team.todoStateId)
    )
      throw new Error('shipping-lead-mutation-target-mismatch');
    await capacity();
    await beforeMutation({ taskKey: task.taskKey, method, issueId: id });
    // Re-read after persistence too; a concurrent owner may have acquired it.
    await recheck();
    const result = await client[method](id, value);
    if (
      method === 'transitionIssue' &&
      (result?.success || result?.issueUpdate?.success)
    )
      transitioned = true;
    return result;
  };
  const boundedClient = {
    ...client,
    addComment: (id, body) => mutate('addComment', id, body),
    setIssueLabels: (id, labels) => mutate('setIssueLabels', id, labels),
    transitionIssue: (id, state) => mutate('transitionIssue', id, state),
  };
  return evaluate(team, issue, dryRun, first, null, {
    client: boundedClient,
    fingerprint: task.taskKey,
    preflight: capacity,
  });
}
