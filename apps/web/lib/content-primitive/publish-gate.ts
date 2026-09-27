import {
  type ContentType,
  isLaunchEnabled,
  type LaunchChannel,
  type ScriptMedium,
} from './contract';

/**
 * Launch gate for outbound content. Publishing is public, so a new content
 * type earns autonomy: the first launch of a type needs one founder approval
 * (Linear `content:needs-tim-approval`, surfaced by Summer as an Ovie card).
 * After at least one approval AND the last 10 machine certifications of the
 * type all passed, later launches of that type publish without a human.
 * A failed certification resets the streak. Auto-publish also needs the
 * `standard` copy-tier judge receipt (canon/VOICE.md: blog = lint + one
 * judge); without it the launch falls back to founder approval.
 */

export const AUTO_PUBLISH_STREAK = 10;
export const FOUNDER_APPROVAL_LABEL = 'content:needs-tim-approval';
export const IDEA_LABEL = 'content:idea';

export interface FounderApproval {
  readonly slug: string;
  readonly approvedAt: string;
  /** Linear issue that carried the decision (the Ovie card's source). */
  readonly issue: string;
}

export interface CertificationRecord {
  readonly slug: string;
  readonly passed: boolean;
  readonly at: string;
}

export interface ContentTypeLedger {
  readonly founderApprovals: readonly FounderApproval[];
  readonly certifications: readonly CertificationRecord[];
}

export interface LaunchLedger {
  readonly contract: 'jovie.content-launch-ledger/v1';
  readonly contentTypes: Readonly<
    Partial<Record<ContentType, ContentTypeLedger>>
  >;
}

export type LaunchDecision =
  | { readonly decision: 'blocked'; readonly reason: string }
  | { readonly decision: 'needs_founder_approval'; readonly reason: string }
  | { readonly decision: 'auto_publish'; readonly reason: string };

export function certificationStreak(
  records: readonly CertificationRecord[]
): number {
  let streak = 0;
  for (let index = records.length - 1; index >= 0; index--) {
    if (!records[index]?.passed) break;
    streak++;
  }
  return streak;
}

export function decideLaunch(input: {
  readonly contentType: ContentType;
  readonly medium: ScriptMedium;
  readonly channel: LaunchChannel;
  readonly slug: string;
  readonly certified: boolean;
  /** Standard-tier @jovie/copy judge passed for this script. */
  readonly judged: boolean;
  readonly ledger: LaunchLedger;
}): LaunchDecision {
  if (!isLaunchEnabled(input.medium, input.channel)) {
    return {
      decision: 'blocked',
      reason: `${input.medium} to ${input.channel} is not a built launch target`,
    };
  }
  if (!input.certified) {
    return {
      decision: 'blocked',
      reason: 'script failed machine certification',
    };
  }
  const history = input.ledger.contentTypes[input.contentType] ?? {
    founderApprovals: [],
    certifications: [],
  };
  if (history.founderApprovals.some(approval => approval.slug === input.slug)) {
    return {
      decision: 'auto_publish',
      reason: 'founder approved this script',
    };
  }
  const approvals = history.founderApprovals.length;
  const streak = certificationStreak(history.certifications);
  if (approvals >= 1 && streak >= AUTO_PUBLISH_STREAK && !input.judged) {
    return {
      decision: 'needs_founder_approval',
      reason: 'standard-tier copy judge receipt missing',
    };
  }
  if (approvals >= 1 && streak >= AUTO_PUBLISH_STREAK) {
    return {
      decision: 'auto_publish',
      reason: `${approvals} founder approval(s) and ${streak}/${AUTO_PUBLISH_STREAK} consecutive certifications`,
    };
  }
  return {
    decision: 'needs_founder_approval',
    reason:
      approvals === 0
        ? `first ${input.contentType} launch needs one founder approval`
        : `certification streak ${streak}/${AUTO_PUBLISH_STREAK}`,
  };
}

/** Append a certification result (the only ledger write the pipeline makes on its own). */
export function recordCertification(
  ledger: LaunchLedger,
  contentType: ContentType,
  record: CertificationRecord
): LaunchLedger {
  const history = ledger.contentTypes[contentType] ?? {
    founderApprovals: [],
    certifications: [],
  };
  return {
    ...ledger,
    contentTypes: {
      ...ledger.contentTypes,
      [contentType]: {
        ...history,
        certifications: [...history.certifications, record],
      },
    },
  };
}
