/**
 * Exact delivery receipts for the autonomous shipping control plane.
 *
 * A merged PR is not a shipped issue.  This module keeps that distinction
 * machine-readable: an issue is only delivery-complete when its merge SHA has
 * an exact, successful Production Controller receipt whose Production Verified
 * job also succeeded.
 */

export const DELIVERY_TRACE_SCHEMA_VERSION = 1;

export interface DeliveryTracePr {
  readonly number: number;
  readonly url: string;
  readonly mergeSha: string | null;
  readonly mergedAt: string | null;
  readonly closingIssueNumbers: readonly number[];
}

export interface ProductionControllerReceipt {
  readonly runId: number;
  readonly headSha: string;
  readonly status: 'queued' | 'in_progress' | 'completed';
  readonly conclusion: string | null;
  readonly updatedAt: string;
  readonly productionVerifiedConclusion: string | null;
}

export interface DeliveryTrace {
  readonly schemaVersion: number;
  readonly generatedAt: string;
  readonly traces: readonly DeliveryTraceEntry[];
  readonly summary: {
    readonly complete: number;
    readonly incomplete: number;
    readonly unlinked: number;
  };
}

export interface DeliveryTraceEntry {
  readonly issueNumber: number | null;
  readonly prNumber: number;
  readonly prUrl: string;
  readonly mergeSha: string | null;
  readonly mergedAt: string | null;
  readonly controller: ProductionControllerReceipt | null;
  readonly status:
    | 'unlinked'
    | 'awaiting_merge'
    | 'awaiting_receipt'
    | 'failed_receipt'
    | 'complete';
  readonly reason: string;
}

function terminalReceipt(
  receipt: ProductionControllerReceipt | null
): 'complete' | 'failed' | 'pending' | 'missing' {
  if (!receipt) return 'missing';
  if (receipt.status !== 'completed') return 'pending';
  if (
    receipt.conclusion === 'success' &&
    receipt.productionVerifiedConclusion === 'success'
  ) {
    return 'complete';
  }
  return 'failed';
}

function controllerFor(
  mergeSha: string | null,
  receipts: readonly ProductionControllerReceipt[]
): ProductionControllerReceipt | null {
  if (!mergeSha) return null;
  return receipts.find(receipt => receipt.headSha === mergeSha) ?? null;
}

export function buildDeliveryTrace(input: {
  readonly generatedAt: string;
  readonly mergedPrs: readonly DeliveryTracePr[];
  readonly controllerReceipts: readonly ProductionControllerReceipt[];
}): DeliveryTrace {
  const traces = input.mergedPrs.flatMap(pr => {
    const controller = controllerFor(pr.mergeSha, input.controllerReceipts);
    const receiptStatus = terminalReceipt(controller);
    const issueNumbers = pr.closingIssueNumbers.length
      ? pr.closingIssueNumbers
      : [null];

    return issueNumbers.map(issueNumber => {
      if (issueNumber === null) {
        return {
          issueNumber,
          prNumber: pr.number,
          prUrl: pr.url,
          mergeSha: pr.mergeSha,
          mergedAt: pr.mergedAt,
          controller,
          status: 'unlinked' as const,
          reason:
            'PR has no closing issue reference; it cannot count toward issue-to-production proof.',
        };
      }
      if (!pr.mergeSha || !pr.mergedAt) {
        return {
          issueNumber,
          prNumber: pr.number,
          prUrl: pr.url,
          mergeSha: pr.mergeSha,
          mergedAt: pr.mergedAt,
          controller,
          status: 'awaiting_merge' as const,
          reason: 'Issue is linked, but the PR has no immutable merge receipt.',
        };
      }
      if (receiptStatus === 'complete') {
        return {
          issueNumber,
          prNumber: pr.number,
          prUrl: pr.url,
          mergeSha: pr.mergeSha,
          mergedAt: pr.mergedAt,
          controller,
          status: 'complete' as const,
          reason:
            'Exact merge SHA has a successful Production Controller and Production Verified receipt.',
        };
      }
      if (receiptStatus === 'failed') {
        return {
          issueNumber,
          prNumber: pr.number,
          prUrl: pr.url,
          mergeSha: pr.mergeSha,
          mergedAt: pr.mergedAt,
          controller,
          status: 'failed_receipt' as const,
          reason:
            'Exact merge SHA has a terminal Production Controller receipt that is not fully verified.',
        };
      }
      return {
        issueNumber,
        prNumber: pr.number,
        prUrl: pr.url,
        mergeSha: pr.mergeSha,
        mergedAt: pr.mergedAt,
        controller,
        status: 'awaiting_receipt' as const,
        reason:
          receiptStatus === 'pending'
            ? 'Exact Production Controller is still in progress.'
            : 'No Production Controller receipt exists for the exact merge SHA yet.',
      };
    });
  });

  return {
    schemaVersion: DELIVERY_TRACE_SCHEMA_VERSION,
    generatedAt: input.generatedAt,
    traces,
    summary: {
      complete: traces.filter(trace => trace.status === 'complete').length,
      incomplete: traces.filter(trace =>
        ['awaiting_merge', 'awaiting_receipt', 'failed_receipt'].includes(
          trace.status
        )
      ).length,
      unlinked: traces.filter(trace => trace.status === 'unlinked').length,
    },
  };
}

export function renderDeliveryTrace(trace: DeliveryTrace): string {
  const pending = trace.traces.filter(entry => entry.status !== 'complete');
  return [
    `Delivery trace generated ${trace.generatedAt}`,
    `Complete ${trace.summary.complete} · incomplete ${trace.summary.incomplete} · unlinked ${trace.summary.unlinked}`,
    ...(pending.length
      ? pending
          .slice(0, 10)
          .map(
            entry =>
              `#${entry.prNumber}${entry.issueNumber ? ` → #${entry.issueNumber}` : ''}: ${entry.status} — ${entry.reason}`
          )
      : ['All sampled linked merged PRs have exact production receipts.']),
  ].join('\n');
}
