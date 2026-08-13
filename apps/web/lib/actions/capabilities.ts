import {
  ACTION_MANIFEST,
  type ActionChannel,
  type ActionErrorCode,
  type ActionRequirement,
  type ActionRequirementState,
  buildDescriptorPayload,
  type ResolvedActionCapability,
} from '@jovie/action-contracts';

import type { UserEntitlements } from '@/types';

/**
 * Capability resolver (read-only discovery).
 *
 * Derives per-action availability from the canonical manifest plus the
 * caller's entitlements. Advisory UX only — invocation repeats every check
 * server-side. Degraded billing verification is surfaced as
 * `ENTITLEMENT_UNVERIFIED`, never silently widened.
 */
export interface ResolveActionCapabilitiesParams {
  readonly entitlements: UserEntitlements;
  readonly channel: ActionChannel;
  /** Server-proven ownership of the requested profile scope. */
  readonly profileOwned: boolean;
  /** Current usage per numeric entitlement key (e.g. contactsLimit). */
  readonly quotaUsage?: Readonly<Record<string, number>>;
}

interface RequirementOutcome {
  readonly state: ActionRequirementState;
  readonly retryable: boolean;
  readonly quota?: { readonly used: number; readonly limit: number | null };
  readonly upgrade?: { readonly eligible: boolean };
}

function resolveRequirement(
  requirement: ActionRequirement,
  params: ResolveActionCapabilitiesParams
): RequirementOutcome {
  const { entitlements, profileOwned, quotaUsage } = params;

  if (requirement.type === 'auth') {
    const satisfied = entitlements.isAuthenticated;
    return {
      state: {
        requirement,
        satisfied,
        ...(satisfied ? {} : { reasonCode: 'AUTH_REQUIRED' as const }),
      },
      retryable: false,
    };
  }

  if (requirement.type === 'profile_ownership') {
    return {
      state: {
        requirement,
        satisfied: profileOwned,
        ...(profileOwned ? {} : { reasonCode: 'FORBIDDEN' as const }),
      },
      retryable: false,
    };
  }

  // entitlement requirement
  const value = (entitlements as unknown as Record<string, unknown>)[
    requirement.key
  ];

  if (entitlements.billingVerification === 'unavailable') {
    return {
      state: {
        requirement,
        satisfied: false,
        reasonCode: 'ENTITLEMENT_UNVERIFIED',
      },
      retryable: true,
    };
  }

  if (typeof value === 'number' || value === null) {
    const used = quotaUsage?.[requirement.key] ?? 0;
    const satisfied = value === null || used < value;
    return {
      state: {
        requirement,
        satisfied,
        ...(satisfied ? {} : { reasonCode: 'QUOTA_EXHAUSTED' as const }),
      },
      retryable: false,
      quota: { used, limit: value },
    };
  }

  const satisfied = value === true;
  return {
    state: {
      requirement,
      satisfied,
      ...(satisfied ? {} : { reasonCode: 'ENTITLEMENT_REQUIRED' as const }),
    },
    retryable: false,
    ...(satisfied ? {} : { upgrade: { eligible: true } }),
  };
}

export function resolveActionCapabilities(
  params: ResolveActionCapabilitiesParams
): ResolvedActionCapability[] {
  return ACTION_MANIFEST.map(action => {
    const channelSupported = action.supportedChannels.includes(params.channel);
    const outcomes = action.requirements.map(requirement =>
      resolveRequirement(requirement, params)
    );
    const failing = outcomes.find(outcome => !outcome.state.satisfied);
    const reasonCode = failing?.state.reasonCode as ActionErrorCode | undefined;

    return {
      action: buildDescriptorPayload(action),
      available: channelSupported && !failing,
      visibility: channelSupported ? 'visible' : 'hidden',
      ...(reasonCode ? { reasonCode } : {}),
      retryable: failing?.retryable ?? false,
      requirements: outcomes.map(outcome => outcome.state),
      ...(outcomes.find(outcome => outcome.quota)?.quota
        ? { quota: outcomes.find(outcome => outcome.quota)!.quota! }
        : {}),
      ...(failing?.upgrade ? { upgrade: failing.upgrade } : {}),
    };
  });
}
