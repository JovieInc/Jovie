import { describe, expect, it, vi } from 'vitest';

// Mock handler dependencies to avoid loading real implementations
vi.mock('@clerk/nextjs/server', () => ({
  clerkClient: vi.fn().mockResolvedValue({
    users: { updateUser: vi.fn() },
  }),
}));

vi.mock('@/lib/auth/clerk-sync', () => ({
  syncAllClerkMetadata: vi.fn().mockResolvedValue({ success: true }),
  handleClerkUserDeleted: vi.fn().mockResolvedValue({ success: true }),
  syncEmailFromClerkByClerkId: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock('@/lib/auth/proxy-state', () => ({
  invalidateProxyUserStateCache: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/notifications/providers/slack', () => ({
  notifySlackSignup: vi.fn().mockResolvedValue(undefined),
}));

import {
  getClerkHandler,
  getRegisteredClerkEventTypes,
  isClerkEventTypeRegistered,
} from '@/lib/auth/clerk-webhook/registry';

describe('clerk-webhook-registry', () => {
  describe('getRegisteredClerkEventTypes', () => {
    it('should return all three event types', () => {
      const types = getRegisteredClerkEventTypes();
      expect(types).toContain('user.created');
      expect(types).toContain('user.updated');
      expect(types).toContain('user.deleted');
      expect(types).toHaveLength(3);
    });
  });

  describe('isClerkEventTypeRegistered', () => {
    it('should return true for registered event types', () => {
      expect(isClerkEventTypeRegistered('user.created')).toBe(true);
      expect(isClerkEventTypeRegistered('user.updated')).toBe(true);
      expect(isClerkEventTypeRegistered('user.deleted')).toBe(true);
    });

    it('should return false for unregistered event types', () => {
      expect(isClerkEventTypeRegistered('session.created')).toBe(false);
      expect(isClerkEventTypeRegistered('organization.created')).toBe(false);
      expect(isClerkEventTypeRegistered('')).toBe(false);
      expect(isClerkEventTypeRegistered('invalid')).toBe(false);
    });
  });

  describe('getClerkHandler', () => {
    it('should return a handler for user.created', () => {
      const handler = getClerkHandler('user.created');
      expect(handler).not.toBeNull();
      expect(handler!.eventTypes).toContain('user.created');
    });

    it('should return a handler for user.updated', () => {
      const handler = getClerkHandler('user.updated');
      expect(handler).not.toBeNull();
      expect(handler!.eventTypes).toContain('user.updated');
    });

    it('should return a handler for user.deleted', () => {
      const handler = getClerkHandler('user.deleted');
      expect(handler).not.toBeNull();
      expect(handler!.eventTypes).toContain('user.deleted');
    });

    it('should return null for unregistered event types', () => {
      expect(getClerkHandler('session.created')).toBeNull();
      expect(getClerkHandler('unknown.event')).toBeNull();
    });
  });
});
