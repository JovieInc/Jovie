import { describe, expect, it } from 'vitest';
import {
  buildRetouchUnavailableAssistantMessage,
  detectRetouchIntent,
  isRetouchProvisioned,
  resolveRetouchCapability,
} from '@/lib/chat/retouch-capability';

describe('retouch capability resolution', () => {
  it('marks retouch unavailable when the account lacks the entitlement', () => {
    const capability = resolveRetouchCapability({
      entitlements: {
        canAccessAiRetouching: false,
      } as Awaited<
        ReturnType<
          typeof import('@/lib/entitlements/server').getCurrentUserEntitlements
        >
      >,
    });

    expect(capability).toEqual({
      availability: 'unavailable',
      reason: 'Image retouching requires a Pro plan.',
      reasonCode: 'PLAN_UNAVAILABLE',
    });
  });

  it('marks retouch unavailable when execution is not provisioned', () => {
    expect(isRetouchProvisioned()).toBe(false);

    const capability = resolveRetouchCapability({
      entitlements: {
        canAccessAiRetouching: true,
      } as Awaited<
        ReturnType<
          typeof import('@/lib/entitlements/server').getCurrentUserEntitlements
        >
      >,
    });

    expect(capability).toEqual({
      availability: 'unavailable',
      reason: 'Retouch is not provisioned for this account.',
      reasonCode: 'TOOL_UNPROVISIONED',
    });
  });

  it('detects retouch requests from natural language and tool intent', () => {
    expect(
      detectRetouchIntent({
        text: 'Retouch this image',
      })
    ).toBe(true);
    expect(
      detectRetouchIntent({
        text: 'Touch up my press photo',
      })
    ).toBe(true);
    expect(
      detectRetouchIntent({
        text: 'Write my bio',
        toolIntent: 'image_retouch',
      })
    ).toBe(true);
    expect(
      detectRetouchIntent({
        text: 'Draft a release pitch',
      })
    ).toBe(false);
  });

  it('builds a durable assistant recovery message', () => {
    expect(
      buildRetouchUnavailableAssistantMessage({
        availability: 'unavailable',
        reason: 'Retouch is not provisioned for this account.',
        reasonCode: 'TOOL_UNPROVISIONED',
      })
    ).toContain('retouch direction');
  });
});
