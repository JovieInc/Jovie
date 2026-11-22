import { getLinearIssueSnapshot } from '@/lib/ovie/linear-issue-snapshot.server';
import { ShippingLinearIssueList } from './ShippingLinearIssueList';

/** JOV issues from the Linear snapshot (webhook + cron + a bounded read on a stale page). */
export async function ShippingLinearIssues() {
  const result = await getLinearIssueSnapshot();
  return (
    <ShippingLinearIssueList
      issues={result.snapshot?.issues ?? []}
      generatedAt={result.snapshot?.generatedAt ?? null}
      reachable={result.status === 'ok'}
    />
  );
}
