import 'server-only';

import type { OutboundCopy } from '@/lib/outbound/approval';
import { denyAudienceEffect } from '@/lib/outbound/audience-effect-policy';

interface PushLeadParams {
  email: string;
  firstName: string;
  claimLink: string;
  artistName: string;
  priorityScore: number;
  /**
   * Review metadata only. Approval never grants delivery permission.
   */
  approvedCopy: OutboundCopy & { readonly revision: string };
}

/** Terminal policy refusal; contains no recipient, copy or credentials. */
export class InstantlyAudienceDeliveryBlockedError extends Error {
  readonly policyReceipt = denyAudienceEffect('audience.campaign.enroll');
  readonly code = this.policyReceipt.reason;
  readonly retryable = false;

  constructor() {
    super('audience_delivery_disabled');
    this.name = 'InstantlyAudienceDeliveryBlockedError';
  }
}

/**
 * Direct calls, replayed work and retries cannot enroll an audience recipient.
 * No provider client, credential lookup, HTTP path or retry timer is available
 * through this entry point while audience delivery is closed.
 */
export async function pushLeadToInstantly(
  _params: PushLeadParams
): Promise<string> {
  throw new InstantlyAudienceDeliveryBlockedError();
}
