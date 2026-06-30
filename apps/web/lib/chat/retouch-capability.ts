import type { getCurrentUserEntitlements } from '@/lib/entitlements/server';

export type ToolAvailability = 'available' | 'unavailable' | 'unknown';

export interface RetouchCapability {
  readonly availability: ToolAvailability;
  readonly reason: string | null;
  readonly reasonCode: string | null;
}

type CurrentUserEntitlements = Awaited<
  ReturnType<typeof getCurrentUserEntitlements>
>;

/**
 * Closed-beta retouch execution is gated separately from entitlement checks.
 * Flip to true when JOV-8834 wires the image provider + job queue.
 */
export function isRetouchProvisioned(): boolean {
  return false;
}

export function resolveRetouchCapability(input: {
  readonly entitlements: CurrentUserEntitlements | null;
  readonly provisioned?: boolean;
}): RetouchCapability {
  if (!input.entitlements?.canAccessAiRetouching) {
    return {
      availability: 'unavailable',
      reason: 'Image retouching requires a Pro plan.',
      reasonCode: 'PLAN_UNAVAILABLE',
    };
  }

  const provisioned = input.provisioned ?? isRetouchProvisioned();
  if (!provisioned) {
    return {
      availability: 'unavailable',
      reason: 'Retouch is not provisioned for this account.',
      reasonCode: 'TOOL_UNPROVISIONED',
    };
  }

  return {
    availability: 'available',
    reason: null,
    reasonCode: null,
  };
}

export function detectRetouchIntent(input: {
  readonly text: string;
  readonly toolIntent?: string | null;
}): boolean {
  if (input.toolIntent === 'image_retouch') {
    return true;
  }

  const normalized = input.text.trim().toLowerCase();
  if (!normalized) return false;

  const mentionsImage =
    /\b(photo|image|picture|shot|pic|selfie|portrait|press)\b/.test(normalized);
  const asksForRetouch =
    /\b(retouch|touch[\s-]?up|enhance|polish|clean\s+up)\b/.test(normalized);

  return mentionsImage && asksForRetouch;
}

export function buildRetouchUnavailableAssistantMessage(
  capability: RetouchCapability
): string {
  const reason =
    capability.reason ?? 'Image retouching is temporarily unavailable.';
  return `${reason} I can still help you plan retouch direction, lighting notes, or a brief you can hand to a retoucher.`;
}
