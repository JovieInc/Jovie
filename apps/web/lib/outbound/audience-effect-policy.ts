/**
 * Pure denial contract only: no transport, credentials, queue, or approval issuer.
 * Operation IDs are proposed registry IDs, not bindings to existing Jovie routes.
 * Classification never grants dispatch, including account/security/compliance.
 */
export type EffectClass =
  | 'audience_delivery'
  | 'account_security'
  | 'account_transactional'
  | 'mandatory_compliance'
  | 'owner_control'
  | 'local_only'
  | 'unknown';

const OPERATIONS = Object.freeze({
  'audience.comment.reply': 'audience_delivery',
  'audience.comment.publish': 'audience_delivery',
  'audience.dm.send': 'audience_delivery',
  'audience.email.send': 'audience_delivery',
  'audience.sms.send': 'audience_delivery',
  'audience.bulk.send': 'audience_delivery',
  'audience.campaign.enroll': 'audience_delivery',
  'audience.delivery.schedule': 'audience_delivery',
  'audience.delivery.retry': 'audience_delivery',
  'audience.provider-draft.publish': 'audience_delivery',
  'account.password-reset.send': 'account_security',
  'account.otp.send': 'account_security',
  'account.billing-receipt.send': 'account_transactional',
  'compliance.sms-stop-ack.send': 'mandatory_compliance',
  'compliance.sms-help.send': 'mandatory_compliance',
  'owner.slack.notify': 'owner_control',
  'owner.imessage.notify': 'owner_control',
  'local.draft.write': 'local_only',
  'local.conversation.resolve': 'local_only',
  'local.conversation.snooze': 'local_only',
  'local.person.note': 'local_only',
} as const satisfies Readonly<Record<string, EffectClass>>);

export type BlockReason =
  | 'audience_delivery_disabled'
  | 'separate_authority_required'
  | 'local_operation_not_dispatchable'
  | 'unclassified_operation';

export interface BlockedEffectReceipt {
  readonly schema: 'jovie.audience-effect-policy/v1';
  readonly policyRevision: 'audience-delivery-disabled-1';
  readonly decision: 'blocked';
  readonly dispatchAllowed: false;
  readonly retryable: false;
  readonly queueDisposition: 'do_not_enqueue_or_retry';
  readonly effectClass: EffectClass;
  readonly reason: BlockReason;
}

/** Strict IDs only; no coercion, inherited keys, getters, aliases or purpose claims. */
export function classifyAudienceEffect(operation: unknown): EffectClass {
  if (typeof operation !== 'string' || !Object.hasOwn(OPERATIONS, operation)) {
    return 'unknown';
  }
  return OPERATIONS[operation as keyof typeof OPERATIONS];
}

/**
 * Always denies dispatch. Approval, actor, consent, scopes, channel, content and
 * feature flags are deliberately absent from this API: none can grant delivery.
 * Receipts omit the input, content and identities to avoid logging private data.
 */
export function denyAudienceEffect(operation: unknown): BlockedEffectReceipt {
  const effectClass = classifyAudienceEffect(operation);
  let reason: BlockReason;
  switch (effectClass) {
    case 'audience_delivery':
      reason = 'audience_delivery_disabled';
      break;
    case 'local_only':
      reason = 'local_operation_not_dispatchable';
      break;
    case 'unknown':
      reason = 'unclassified_operation';
      break;
    default:
      reason = 'separate_authority_required';
  }
  return Object.freeze({
    schema: 'jovie.audience-effect-policy/v1',
    policyRevision: 'audience-delivery-disabled-1',
    decision: 'blocked',
    dispatchAllowed: false,
    retryable: false,
    queueDisposition: 'do_not_enqueue_or_retry',
    effectClass,
    reason,
  });
}
