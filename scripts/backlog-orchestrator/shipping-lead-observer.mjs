import {
  shippingDigest,
  validateShippingTask,
} from '../symphony/summer-shipping-lead-contract.mjs';
import { admissionLeaseReceipt } from './admitter.mjs';

/** Positive source evidence only; an absent/truncated lease can never mean completion. */
export async function readShippingLeadIssue(task, { client }) {
  validateShippingTask(task);
  const issue = await client.fetchIssue(task.issue.identifier);
  if (
    issue?.id !== task.issue.id ||
    issue?.identifier !== task.issue.identifier
  )
    throw new Error('shipping-lead-observed-issue-mismatch');
  const leases = (issue.comments?.nodes ?? [])
    .map(comment => admissionLeaseReceipt(issue, comment.body))
    .filter(
      lease =>
        lease?.fingerprint === task.taskKey &&
        Number.isFinite(Date.parse(lease.at)) &&
        Date.parse(lease.at) >= Date.parse(task.createdAt) &&
        Date.parse(lease.at) <= Date.parse(task.expiresAt)
    );
  const unique = new Map(leases.map(lease => [shippingDigest(lease), lease]));
  if (unique.size !== 1)
    throw new Error('shipping-lead-canonical-lease-unavailable');
  const [leaseDigest, lease] = [...unique][0];
  return {
    issueId: issue.id,
    identifier: issue.identifier,
    leaseDigest,
    admittedAt: lease.at,
    state: issue.state?.name ?? null,
  };
}
