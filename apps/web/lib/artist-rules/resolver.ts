import type { ArtistRule } from '@/lib/db/schema/library-content-graph';

export interface ArtistRuleContext {
  readonly channel?: string;
  readonly releaseId?: string;
  readonly itemKind?: string;
  readonly itemId?: string;
}

export interface ArtistRuleException {
  readonly ruleId: string;
  readonly scope: ArtistRule['scope'];
  readonly scopeValue: string | null;
  readonly authorUserId: string;
  readonly reason: string;
  readonly evidence: Record<string, unknown>;
  readonly expiresAt: Date | null;
}

export type ArtistRuleActivationResult =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly reason: 'not_suggested' | 'missing_confirmation';
    };

export function validateArtistRuleActivation(
  rule: ArtistRule
): ArtistRuleActivationResult {
  if (rule.status !== 'suggested') {
    return { ok: false, reason: 'not_suggested' };
  }
  if (!rule.confirmedBy || !rule.confirmedAt) {
    return { ok: false, reason: 'missing_confirmation' };
  }
  return { ok: true };
}

export type ArtistRuleExceptionResult =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly reason:
        | 'rule_not_active'
        | 'override_forbidden'
        | 'missing_exception_evidence';
    };

export function validateArtistRuleException(
  rule: ArtistRule,
  exception: ArtistRuleException
): ArtistRuleExceptionResult {
  if (rule.status !== 'active') {
    return { ok: false, reason: 'rule_not_active' };
  }
  if (!rule.allowOverride) {
    return { ok: false, reason: 'override_forbidden' };
  }
  if (
    !exception.authorUserId.trim() ||
    !exception.reason.trim() ||
    Object.keys(exception.evidence).length === 0
  ) {
    return { ok: false, reason: 'missing_exception_evidence' };
  }
  return { ok: true };
}

const SCOPE_SPECIFICITY: Record<ArtistRule['scope'], number> = {
  artist: 0,
  channel: 1,
  item_kind: 2,
  release: 3,
  item: 4,
};

function ruleMatchesContext(
  rule: ArtistRule,
  context: ArtistRuleContext
): boolean {
  if (rule.scope === 'artist') return true;
  if (!rule.scopeValue) return false;
  if (rule.scope === 'channel') return context.channel === rule.scopeValue;
  if (rule.scope === 'release') return context.releaseId === rule.scopeValue;
  if (rule.scope === 'item_kind') return context.itemKind === rule.scopeValue;
  return context.itemId === rule.scopeValue;
}

function effectiveTimestamp(rule: ArtistRule): number {
  return (rule.effectiveAt ?? rule.confirmedAt ?? rule.createdAt).getTime();
}

function ruleIsEffective(rule: ArtistRule, now: Date): boolean {
  if (rule.status !== 'active') return false;
  if (rule.effectiveAt && rule.effectiveAt > now) return false;
  if (rule.expiresAt && rule.expiresAt <= now) return false;
  return true;
}

function compareRules(left: ArtistRule, right: ArtistRule): number {
  if (left.strength !== right.strength) {
    return left.strength === 'hard_constraint' ? -1 : 1;
  }
  const specificity =
    SCOPE_SPECIFICITY[right.scope] - SCOPE_SPECIFICITY[left.scope];
  if (specificity !== 0) return specificity;
  return effectiveTimestamp(right) - effectiveTimestamp(left);
}

export interface ResolvedArtistRuleSet {
  readonly effective: readonly ArtistRule[];
  readonly shadowed: readonly {
    readonly rule: ArtistRule;
    readonly byRuleId: string;
    readonly reason: 'hard_constraint' | 'narrower_scope' | 'newer_rule';
  }[];
  readonly conflicts: readonly {
    readonly ruleKey: string;
    readonly ruleIds: readonly string[];
    readonly reason: 'same_precedence';
  }[];
}

export function resolveArtistRuleSet(input: {
  readonly rules: readonly ArtistRule[];
  readonly context: ArtistRuleContext;
  readonly now?: Date;
}): ResolvedArtistRuleSet {
  const now = input.now ?? new Date();
  const groups = new Map<string, ArtistRule[]>();
  for (const rule of input.rules) {
    if (!ruleIsEffective(rule, now)) continue;
    if (!ruleMatchesContext(rule, input.context)) continue;
    const key = `${rule.category}:${rule.ruleKey}`;
    groups.set(key, [...(groups.get(key) ?? []), rule]);
  }

  const effective: ArtistRule[] = [];
  const shadowed: ResolvedArtistRuleSet['shadowed'][number][] = [];
  const conflicts: ResolvedArtistRuleSet['conflicts'][number][] = [];
  for (const [ruleKey, candidates] of groups) {
    const ordered = candidates.toSorted(compareRules);
    const winner = ordered[0];
    if (!winner) continue;
    const tied = ordered.filter(
      rule =>
        rule.strength === winner.strength &&
        SCOPE_SPECIFICITY[rule.scope] === SCOPE_SPECIFICITY[winner.scope] &&
        effectiveTimestamp(rule) === effectiveTimestamp(winner)
    );
    if (
      tied.length > 1 &&
      new Set(tied.map(rule => rule.instruction.trim())).size > 1
    ) {
      conflicts.push({
        ruleKey,
        ruleIds: tied.map(rule => rule.id),
        reason: 'same_precedence',
      });
      continue;
    }
    effective.push(winner);
    for (const rule of ordered.slice(1)) {
      const reason =
        winner.strength === 'hard_constraint' && rule.strength === 'preference'
          ? 'hard_constraint'
          : SCOPE_SPECIFICITY[winner.scope] > SCOPE_SPECIFICITY[rule.scope]
            ? 'narrower_scope'
            : 'newer_rule';
      shadowed.push({ rule, byRuleId: winner.id, reason });
    }
  }
  return { effective: effective.toSorted(compareRules), shadowed, conflicts };
}
