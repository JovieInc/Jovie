import type { WaitlistRequestPayload } from '@/lib/validation/schemas';

export type WaitlistMode = 'open_signup' | 'waitlist_enabled' | 'hard_closed';

export type QualificationReasonCode =
  | 'qualified_open_signup'
  | 'qualified_auto_accept'
  | 'waitlist_gate_enabled'
  | 'waitlist_capacity_full'
  | 'hard_closed'
  | 'invalid_primary_social_url'
  | 'blocked_email_domain';

export interface QualificationConfig {
  readonly mode: WaitlistMode;
  readonly autoAcceptReserved?: boolean;
  readonly blockedEmailDomains?: readonly string[];
}

export interface QualificationDecision {
  readonly qualified: boolean;
  readonly status: 'approved' | 'waitlisted' | 'blocked';
  readonly reasonCode: QualificationReasonCode;
  readonly details: Record<string, unknown>;
}

function getEmailDomain(email: string): string {
  return email.split('@').at(1)?.trim().toLowerCase() ?? '';
}

function hasValidPrimarySocialUrl(payload: WaitlistRequestPayload): boolean {
  try {
    const parsed = new URL(payload.primarySocialUrl);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

export function evaluateWaitlistQualification(params: {
  readonly email: string;
  readonly payload: WaitlistRequestPayload;
  readonly config: QualificationConfig;
}): QualificationDecision {
  const emailDomain = getEmailDomain(params.email);
  const blockedDomains = new Set(
    params.config.blockedEmailDomains?.map(domain =>
      domain.trim().toLowerCase()
    ) ?? []
  );

  if (blockedDomains.has(emailDomain)) {
    return {
      qualified: false,
      status: 'blocked',
      reasonCode: 'blocked_email_domain',
      details: { emailDomain },
    };
  }

  if (!hasValidPrimarySocialUrl(params.payload)) {
    return {
      qualified: false,
      status: 'waitlisted',
      reasonCode: 'invalid_primary_social_url',
      details: { field: 'primarySocialUrl' },
    };
  }

  if (params.config.mode === 'hard_closed') {
    return {
      qualified: true,
      status: 'waitlisted',
      reasonCode: 'hard_closed',
      details: { mode: params.config.mode },
    };
  }

  if (params.config.mode === 'open_signup') {
    return {
      qualified: true,
      status: 'approved',
      reasonCode: 'qualified_open_signup',
      details: { mode: params.config.mode },
    };
  }

  if (params.config.autoAcceptReserved) {
    return {
      qualified: true,
      status: 'approved',
      reasonCode: 'qualified_auto_accept',
      details: { mode: params.config.mode },
    };
  }

  return {
    qualified: true,
    status: 'waitlisted',
    reasonCode:
      params.config.autoAcceptReserved === false
        ? 'waitlist_capacity_full'
        : 'waitlist_gate_enabled',
    details: { mode: params.config.mode },
  };
}
