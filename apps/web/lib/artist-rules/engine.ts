/** Confirmed typed artist rules. Memory may propose; only confirmed rules enforce. */

export const ARTIST_RULE_KINDS = [
  'hard_constraint',
  'soft_preference',
] as const;
export type ArtistRuleKind = (typeof ARTIST_RULE_KINDS)[number];
export const ARTIST_RULE_DOMAINS = [
  'truth',
  'safety',
  'law',
  'platform',
  'active_contract',
  'artist_preference',
] as const;
export type ArtistRuleDomain = (typeof ARTIST_RULE_DOMAINS)[number];
export type ArtistRuleStatus = 'proposed' | 'confirmed' | 'retired';
export type ArtistRuleExceptionScope = 'item' | 'release' | 'recording';

/** Lower rank outranks. */
export const ARTIST_RULE_DOMAIN_PRECEDENCE: Record<ArtistRuleDomain, number> = {
  truth: 0,
  safety: 1,
  law: 2,
  platform: 3,
  active_contract: 4,
  artist_preference: 5,
};

export interface ArtistRule {
  readonly id: string;
  readonly creatorProfileId: string;
  readonly kind: ArtistRuleKind;
  readonly domain: ArtistRuleDomain;
  readonly status: ArtistRuleStatus;
  readonly statement: string;
  readonly selector: {
    readonly actions?: readonly string[];
    readonly itemTypes?: readonly string[];
    readonly itemIds?: readonly string[];
  };
  readonly provenance: {
    readonly sourceType: 'memory_observation' | 'manual' | 'contract';
    readonly sourceId: string | null;
    readonly confirmedBy: string | null;
    readonly confirmedAt: string | null;
  };
  readonly overrideable: boolean;
}

export interface ArtistRuleException {
  readonly id: string;
  readonly ruleId: string;
  readonly scope: ArtistRuleExceptionScope;
  readonly scopeId: string;
  readonly authorizedBy: string;
  readonly rationale: string;
}

export interface ArtistRuleEvaluationContext {
  readonly action: string;
  readonly itemType?: string;
  readonly itemId?: string;
  readonly releaseId?: string;
  readonly recordingId?: string;
}

export const isRuleOverrideable = (rule: Pick<ArtistRule, 'domain'>) =>
  rule.domain === 'artist_preference';

export function compareArtistRulePrecedence(a: ArtistRule, b: ArtistRule) {
  const delta =
    ARTIST_RULE_DOMAIN_PRECEDENCE[a.domain] -
    ARTIST_RULE_DOMAIN_PRECEDENCE[b.domain];
  if (delta !== 0) return delta;
  if (a.kind === b.kind) return 0;
  return a.kind === 'hard_constraint' ? -1 : 1;
}

function applies(rule: ArtistRule, ctx: ArtistRuleEvaluationContext) {
  const { selector } = rule;
  if (selector.actions?.length && !selector.actions.includes(ctx.action)) {
    return false;
  }
  if (
    selector.itemTypes?.length &&
    !selector.itemTypes.includes(ctx.itemType ?? '')
  ) {
    return false;
  }
  if (
    selector.itemIds?.length &&
    !selector.itemIds.includes(ctx.itemId ?? '')
  ) {
    return false;
  }
  return true;
}

function exceptionMatches(
  exception: ArtistRuleException,
  ctx: ArtistRuleEvaluationContext
) {
  if (exception.scope === 'item') return exception.scopeId === ctx.itemId;
  if (exception.scope === 'release') return exception.scopeId === ctx.releaseId;
  return exception.scopeId === ctx.recordingId;
}

export function proposeArtistRuleFromMemory(input: {
  readonly id: string;
  readonly creatorProfileId: string;
  readonly statement: string;
  readonly observationId: string;
  readonly kind?: ArtistRuleKind;
  readonly domain?: ArtistRuleDomain;
}): ArtistRule {
  const domain = input.domain ?? 'artist_preference';
  return {
    id: input.id,
    creatorProfileId: input.creatorProfileId,
    kind: input.kind ?? 'soft_preference',
    domain,
    status: 'proposed',
    statement: input.statement,
    selector: {},
    provenance: {
      sourceType: 'memory_observation',
      sourceId: input.observationId,
      confirmedBy: null,
      confirmedAt: null,
    },
    overrideable: isRuleOverrideable({ domain }),
  };
}

export function confirmArtistRule(
  rule: ArtistRule,
  confirmedBy: string,
  confirmedAt: string
): ArtistRule {
  if (rule.status === 'retired')
    throw new Error('Cannot confirm a retired artist rule');
  return {
    ...rule,
    status: 'confirmed',
    overrideable: isRuleOverrideable(rule),
    provenance: { ...rule.provenance, confirmedBy, confirmedAt },
  };
}

export function authorizeArtistRuleException(input: {
  readonly id: string;
  readonly rule: ArtistRule;
  readonly scope: ArtistRuleExceptionScope;
  readonly scopeId: string;
  readonly authorizedBy: string;
  readonly rationale: string;
}): ArtistRuleException {
  if (!input.rule.overrideable || !isRuleOverrideable(input.rule)) {
    throw new Error(
      'Exceptions are only authorized for overrideable artist-preference rules'
    );
  }
  if (input.rule.status !== 'confirmed') {
    throw new Error('Exceptions require a confirmed rule');
  }
  if (!input.authorizedBy.trim() || !input.rationale.trim()) {
    throw new Error('Exceptions require an authorizer and rationale');
  }
  return {
    id: input.id,
    ruleId: input.rule.id,
    scope: input.scope,
    scopeId: input.scopeId,
    authorizedBy: input.authorizedBy,
    rationale: input.rationale.trim(),
  };
}

export function evaluateArtistRules(
  rules: readonly ArtistRule[],
  exceptions: readonly ArtistRuleException[],
  context: ArtistRuleEvaluationContext
) {
  const skippedExceptionRuleIds: string[] = [];
  const enforceable = [...rules]
    .filter(rule => rule.status === 'confirmed' && applies(rule, context))
    .filter(rule => {
      const hit = exceptions.some(
        exception =>
          exception.ruleId === rule.id && exceptionMatches(exception, context)
      );
      if (!hit || !rule.overrideable) return true;
      skippedExceptionRuleIds.push(rule.id);
      return false;
    })
    .sort(compareArtistRulePrecedence);
  const blocking = enforceable.find(rule => rule.kind === 'hard_constraint');
  return {
    allowed: !blocking,
    blockingRuleId: blocking?.id ?? null,
    blockingStatement: blocking?.statement ?? null,
    preferences: enforceable.filter(rule => rule.kind === 'soft_preference'),
    skippedExceptionRuleIds,
  };
}
