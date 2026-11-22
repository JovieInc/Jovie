import 'server-only';

import { linearGraphql } from '@/lib/ovie/linear-coordination-live';
import { logSummerBridgeEvent } from '@/lib/ovie/summer-production-pin';

/**
 * Tim, 2026-11-22: "nothing should be able to fail without a repair or a
 * sucess". A founder turn that still fails after its retries opens (or
 * refreshes) one Linear repair issue per failure hop. The fingerprint in the
 * title dedupes it, so 18 failures make one issue with a running count, not 18.
 */
const JOVIE_TEAM_ID = 'bdc09edc-f91c-4a06-b308-74b4fcf093f8';
const REPAIR_LABEL = 'repair';
/** One Linear round trip per hop per warm instance in this window. */
const FILE_INTERVAL_MS = 15 * 60_000;

export interface SummerTurnFailure {
  readonly hop: string;
  readonly state: string;
  readonly requestId: string;
  readonly environment: string;
  readonly at: Date;
}

type Graphql = <T>(
  query: string,
  variables: Record<string, unknown>
) => Promise<T>;

const lastFiled = new Map<string, number>();
const pending = new Map<string, number>();

export function summerTurnRepairFingerprint(hop: string): string {
  return `[summer-founder-turn:${hop}]`;
}

export function resetSummerTurnRepairThrottle(): void {
  lastFiled.clear();
  pending.clear();
}

export async function fileSummerTurnRepair(
  failure: SummerTurnFailure,
  graphql: Graphql = linearGraphql
): Promise<'filed' | 'throttled' | 'failed'> {
  const key = `${failure.environment}:${failure.hop}`;
  const now = failure.at.getTime();
  const count = (pending.get(key) ?? 0) + 1;
  const last = lastFiled.get(key);
  if (last !== undefined && now - last < FILE_INTERVAL_MS) {
    pending.set(key, count);
    return 'throttled';
  }
  lastFiled.set(key, now);
  pending.set(key, 0);
  const fingerprint = summerTurnRepairFingerprint(failure.hop);
  const line = `Latest: ${failure.at.toISOString()} ${failure.environment} state=${failure.state} request=${failure.requestId} (${count} failure${count === 1 ? '' : 's'} since the last note)`;
  try {
    const found = await graphql<{
      issues: {
        nodes: Array<{ id: string; title: string; state: { type: string } }>;
      };
    }>(
      `query FindSummerTurnRepair($fp: String!) { issues(filter: { team: { id: { eq: "${JOVIE_TEAM_ID}" } }, title: { contains: $fp } }, first: 10) { nodes { id title state { type } } } }`,
      { fp: fingerprint }
    );
    const open = found.issues.nodes.find(
      node =>
        node.title.includes(fingerprint) &&
        node.state.type !== 'completed' &&
        node.state.type !== 'canceled'
    );
    if (open) {
      await graphql(
        `mutation NoteSummerTurnRepair($id: String!, $body: String!) { commentCreate(input: { issueId: $id, body: $body }) { success } }`,
        { id: open.id, body: `Summer founder turn failed again.\n${line}` }
      );
    } else {
      const labels = await graphql<{
        issueLabels: { nodes: Array<{ id: string; name: string }> };
      }>(
        `query RepairLabel($name: String!) { issueLabels(filter: { name: { eq: $name } }, first: 5) { nodes { id name } } }`,
        { name: REPAIR_LABEL }
      );
      const labelIds = labels.issueLabels.nodes
        .filter(node => node.name === REPAIR_LABEL)
        .map(node => node.id)
        .slice(0, 1);
      await graphql(
        `mutation OpenSummerTurnRepair($title: String!, $description: String!, $labelIds: [String!]) { issueCreate(input: { teamId: "${JOVIE_TEAM_ID}", title: $title, description: $description, priority: 2, labelIds: $labelIds }) { success } }`,
        {
          title: `${fingerprint} Summer founder turns fail with ${failure.hop}`,
          description: [
            `Founder turns in Ovie are ending with no reply (hop \`${failure.hop}\`). Each one already retried where retrying was safe.`,
            '',
            'Find the cause from the `summer_admission_failed` and `summer_turn_error` log lines (they name it), fix it, and close this issue. Later failures add a comment here.',
            '',
            line,
          ].join('\n'),
          labelIds,
        }
      );
    }
    logSummerBridgeEvent({
      event: 'summer_turn_repair_filed',
      hop: failure.hop,
      open: Boolean(open),
    });
    return 'filed';
  } catch (error) {
    // Never silent: if the repair cannot be filed, say so loudly in the log.
    lastFiled.delete(key);
    pending.set(key, count);
    logSummerBridgeEvent({
      event: 'summer_turn_repair_unfiled',
      hop: failure.hop,
      cause: error instanceof Error ? error.message.slice(0, 120) : 'unknown',
    });
    return 'failed';
  }
}
