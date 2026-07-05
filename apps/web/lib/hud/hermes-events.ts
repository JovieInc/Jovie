import type { AgentRunArtifact, AgentRunStatus } from '@/lib/agent-os/artifact';
import { safeParseAgentRunArtifact } from '@/lib/agent-os/artifact';

const GITHUB_PULL = 'https://github.com/JovieInc/Jovie/pull/';

function parseTimestamp(raw: unknown): string {
  if (typeof raw === 'string') {
    const parsed = Date.parse(raw);
    if (!Number.isNaN(parsed)) {
      return new Date(parsed).toISOString();
    }
  }
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return new Date(raw).toISOString();
  }
  return new Date().toISOString();
}

function mapOutcome(outcome: unknown, detail: string): AgentRunStatus {
  const value = String(outcome ?? '').toLowerCase();
  if (
    value === 'ok' ||
    value === 'success' ||
    value === 'done' ||
    value === 'completed'
  ) {
    return 'done';
  }
  if (value === 'failed' || value === 'error' || value === 'fail') {
    return 'failed';
  }
  if (value === 'blocked' || value === 'block') {
    return 'blocked';
  }
  if (value === 'running' || value === 'start' || value === 'started') {
    return 'running';
  }
  if (value === 'review') {
    return 'review';
  }
  if (detail.toLowerCase().includes('blocked')) {
    return 'blocked';
  }
  return 'done';
}

function stableId(event: Record<string, unknown>): string {
  const parts = [
    event.ts,
    event.action,
    event.source,
    event.job,
    event.pr,
    event.run_id,
    event.detail,
  ]
    .filter(Boolean)
    .join('|');
  let hash = 0;
  for (let i = 0; i < parts.length; i++) {
    hash = (hash << 5) - hash + parts.charCodeAt(i);
    hash |= 0;
  }
  return `hermes-${Math.abs(hash).toString(36)}`;
}

/**
 * Map Hermes events.jsonl records (watchdog, ship, merge queue, etc.) to Agent OS artifacts.
 */
export function mapHermesEventsToAgentRunArtifacts(
  events: ReadonlyArray<Record<string, unknown>>
): AgentRunArtifact[] {
  const sorted = [...events].reverse();
  const seen = new Set<string>();
  const artifacts: AgentRunArtifact[] = [];

  for (const event of sorted) {
    const action = String(event.action ?? 'event');
    const source = String(event.source ?? event.job ?? 'hermes');
    const actor = String(event.actor ?? 'hermes');
    const detail = String(event.detail ?? event.message ?? '').trim();
    const title = `${source} · ${action}`.slice(0, 180);
    const summary = (detail || title).slice(0, 1200);
    const status = mapOutcome(event.outcome, detail);
    const id = stableId(event);
    if (seen.has(id)) continue;
    seen.add(id);

    const pr =
      typeof event.pr === 'number'
        ? event.pr
        : typeof event.pr === 'string'
          ? Number.parseInt(event.pr, 10)
          : NaN;
    const pullRequestUrl =
      Number.isFinite(pr) && pr > 0 ? `${GITHUB_PULL}${pr}` : null;

    const blockedReason = status === 'blocked' ? summary.slice(0, 500) : null;
    const updatedAt = parseTimestamp(event.ts ?? event.timestamp);

    const candidate = {
      id,
      source: 'hermes' as const,
      sourceRunId:
        typeof event.run_id === 'string' || typeof event.run_id === 'number'
          ? String(event.run_id)
          : null,
      kind: 'workflow' as const,
      status,
      title,
      summary,
      modelRoute: 'deterministic' as const,
      allowedActions: [] as const,
      forbiddenActions: ['deploy', 'merge', 'mutate_production_data'] as const,
      humanApprovalRequired: false,
      humanGate: {
        required: false,
        status: 'not_required' as const,
        reason: null,
        reviewer: null,
        reviewedAt: null,
      },
      linearIssueId: null,
      linearIssueUrl: null,
      pullRequestUrl,
      adminSurface: null,
      verificationGates: [],
      costEstimate: null,
      blockedReason,
      createdAt: updatedAt,
      updatedAt,
      metadata: {
        actor,
        rawAction: action,
        rawSource: source,
      },
    };

    const parsed = safeParseAgentRunArtifact(candidate);
    if (parsed.success) {
      artifacts.push(parsed.data);
    }
  }

  return artifacts.slice(0, 50);
}
