/**
 * DashboardShellContent Behavior Tests
 * @critical — Tests the routing and data selection logic that drives the shell
 *
 * DashboardShellContent is an async server component. We test the real
 * routing helper functions it calls, not tautological local objects.
 */
import { describe, expect, it } from 'vitest';
import {
  isChatShellRoute,
  shouldRedirectToOnboarding,
  shouldUseEssentialShellData,
} from '@/app/app/(shell)/shell-route-matches';

describe('@critical DashboardShellContent — routing logic', () => {
  describe('essential vs full shell data selection', () => {
    it('chat routes use essential shell data', () => {
      expect(shouldUseEssentialShellData('/app/chat')).toBe(true);
      expect(shouldUseEssentialShellData('/app/chat/thread-123')).toBe(true);
    });

    it('releases routes use essential shell data', () => {
      expect(shouldUseEssentialShellData('/app/dashboard/releases')).toBe(true);
    });

    it('dashboard root uses essential shell data', () => {
      expect(shouldUseEssentialShellData('/app')).toBe(true);
    });

    it('settings routes use full dashboard data', () => {
      expect(shouldUseEssentialShellData('/app/settings')).toBe(false);
    });

    it('null pathname uses full dashboard data', () => {
      expect(shouldUseEssentialShellData(null)).toBe(false);
    });
  });

  describe('onboarding redirect gating', () => {
    it('fires for chat routes', () => {
      expect(shouldRedirectToOnboarding('/app/chat')).toBe(true);
    });

    it('fires for releases routes', () => {
      expect(shouldRedirectToOnboarding('/app/dashboard/releases')).toBe(true);
    });

    it('does not fire for null pathname', () => {
      expect(shouldRedirectToOnboarding(null)).toBe(false);
    });

    it('does not fire for non-lightweight routes', () => {
      expect(shouldRedirectToOnboarding('/app/settings')).toBe(false);
    });
  });

  describe('essential shell skips HydrateClient wrapper', () => {
    it('chat route is essential (no HydrateClient)', () => {
      expect(isChatShellRoute('/app/chat')).toBe(true);
    });

    it('settings route is not essential (gets HydrateClient)', () => {
      expect(isChatShellRoute('/app/settings')).toBe(false);
    });
  });
});
