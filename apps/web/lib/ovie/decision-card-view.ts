import { formatCountdown } from '@/lib/home-loop/contract';
import { defaultContradictsDecision } from './decision-card-copy';
import type { OvieInboxCase } from './inbox';

/** Under this, the deadline line takes the warning accent. */
export const DECISION_CARD_NEAR_DEADLINE_MS = 2 * 60 * 60 * 1000;
export const DECISION_CARD_MAX_EVIDENCE = 3;

export type DecisionCardDeadlineTone = 'calm' | 'near' | 'due';

export interface DecisionCardDefault {
  readonly decision: 'approve' | 'reject';
  /** "in 31h", "in 45m"; `null` once due. */
  readonly relative: string | null;
  readonly deadline: string;
  readonly tone: DecisionCardDeadlineTone;
  /** What ships, unless it contradicts what the deadline records. */
  readonly summary: string | null;
  /** The filed text says the opposite of the recorded default. */
  readonly conflict: boolean;
}

export interface DecisionCardEvidence {
  readonly href: string;
  readonly label: string;
}

export interface DecisionCardView {
  readonly decision: string;
  readonly fallback: DecisionCardDefault | null;
  /** No-default cards: hours waited and escalation level. */
  readonly waiting: {
    readonly hours: number;
    readonly level: 0 | 1 | 2;
  } | null;
  readonly facts: readonly string[];
  readonly evidence: readonly DecisionCardEvidence[];
}

const GITHUB_REF = /^\/([^/]+)\/([^/]+)\/(pull|issues)\/(\d+)/u;
const LINEAR_REF = /^\/[^/]+\/issue\/([A-Za-z]+-\d+)/u;

/** "PR #23602", "JOV-9787", or the bare host: never a raw URL. */
export function evidenceLabel(href: string): string {
  if (href.startsWith('/api/admin/hud/visual-qa/')) {
    return `${href.split('/').pop() ?? 'Screenshot'}`.replace(/^./u, char =>
      char.toUpperCase()
    );
  }
  try {
    const url = new URL(href);
    const host = url.hostname.replace(/^www\./u, '');
    const github =
      host === 'github.com' ? url.pathname.match(GITHUB_REF) : null;
    if (github) {
      const suffix = url.pathname.endsWith('.diff') ? ' diff' : '';
      return `${github[3] === 'pull' ? 'PR' : 'Issue'} #${github[4]}${suffix}`;
    }
    const linear =
      host === 'linear.app' ? url.pathname.match(LINEAR_REF) : null;
    if (linear) return linear[1].toUpperCase();
    return host;
  } catch {
    return 'Evidence';
  }
}

function isRenderableEvidence(ref: string): boolean {
  return (
    /^https?:\/\//u.test(ref) || ref.startsWith('/api/admin/hud/visual-qa/')
  );
}

function deadlineTone(
  deadline: string,
  nowMs: number
): DecisionCardDeadlineTone {
  const remaining = Date.parse(deadline) - nowMs;
  if (!Number.isFinite(remaining) || remaining <= 0) return 'due';
  return remaining <= DECISION_CARD_NEAR_DEADLINE_MS ? 'near' : 'calm';
}

/**
 * The one projection every Ovie decision card renders from: the decision line,
 * what the deadline records and when, up to three facts, and labelled evidence.
 * The brief (`body`) never reaches the face.
 */
export function decisionCardView(
  item: Pick<
    OvieInboxCase,
    | 'title'
    | 'recommendation'
    | 'facts'
    | 'evidence'
    | 'decisionDefault'
    | 'escalation'
  >,
  nowMs: number
): DecisionCardView {
  const declared = item.decisionDefault ?? null;
  const conflict = declared
    ? defaultContradictsDecision(declared.summary, declared.decision)
    : false;
  const relative = declared ? formatCountdown(declared.deadline, nowMs) : null;
  const facts = (
    item.facts && item.facts.length > 0 ? item.facts : [item.recommendation]
  )
    .map(fact => fact.trim())
    .filter(Boolean)
    .slice(0, 3);
  const seen = new Set<string>();
  const evidence = item.evidence
    .filter(isRenderableEvidence)
    .map(href => ({ href, label: evidenceLabel(href) }))
    .filter(entry => {
      if (seen.has(entry.label)) return false;
      seen.add(entry.label);
      return true;
    })
    .slice(0, DECISION_CARD_MAX_EVIDENCE);

  return {
    decision: item.title.trim(),
    fallback: declared
      ? {
          decision: declared.decision,
          relative: relative === 'now' ? null : relative,
          deadline: declared.deadline,
          tone: deadlineTone(declared.deadline, nowMs),
          // Only a declared, consistent summary says what ships.
          summary: declared.declared && !conflict ? declared.summary : null,
          conflict,
        }
      : null,
    waiting: item.escalation
      ? { hours: item.escalation.waitingHours, level: item.escalation.level }
      : null,
    facts,
    evidence,
  };
}
