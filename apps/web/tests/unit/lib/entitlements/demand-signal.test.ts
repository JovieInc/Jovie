import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockAddBreadcrumb, mockTrackServerEvent } = vi.hoisted(() => ({
  mockAddBreadcrumb: vi.fn(),
  mockTrackServerEvent: vi.fn().mockResolvedValue({
    ok: true,
    eventId: 'event-1',
  }),
}));

vi.mock('@sentry/nextjs', () => ({
  addBreadcrumb: mockAddBreadcrumb,
}));

vi.mock('@/lib/server-analytics', () => ({
  trackServerEvent: mockTrackServerEvent,
}));

import { logEntitlementDenial } from '@/lib/entitlements/demand-signal';

describe('logEntitlementDenial', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('records demand signal as breadcrumb + analytics, never as an exception', async () => {
    await logEntitlementDenial({
      gate: 'canAccessTasksWorkspace',
      source: 'chat-tool-locked-stub',
      toolName: 'manageTasks',
      planRequired: 'Pro',
      message: 'Tasks requires a Pro plan.',
    });

    expect(mockAddBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'entitlement-denial',
        message: 'plan_gate_denied',
        level: 'info',
        data: expect.objectContaining({
          gate: 'canAccessTasksWorkspace',
          toolName: 'manageTasks',
        }),
      })
    );
    expect(mockTrackServerEvent).toHaveBeenCalledWith(
      'entitlement_denial',
      expect.objectContaining({
        gate: 'canAccessTasksWorkspace',
        source: 'chat-tool-locked-stub',
      }),
      undefined
    );
  });
});
