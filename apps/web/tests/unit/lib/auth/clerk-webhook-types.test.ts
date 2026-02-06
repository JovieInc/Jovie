import { describe, expect, it } from 'vitest';
import { isClerkEventType } from '@/lib/auth/clerk-webhook/types';

describe('clerk-webhook-types', () => {
  describe('isClerkEventType', () => {
    it('should return true for user.created', () => {
      expect(isClerkEventType('user.created')).toBe(true);
    });

    it('should return true for user.updated', () => {
      expect(isClerkEventType('user.updated')).toBe(true);
    });

    it('should return true for user.deleted', () => {
      expect(isClerkEventType('user.deleted')).toBe(true);
    });

    it('should return false for session.created', () => {
      expect(isClerkEventType('session.created')).toBe(false);
    });

    it('should return false for organization.created', () => {
      expect(isClerkEventType('organization.created')).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(isClerkEventType('')).toBe(false);
    });

    it('should return false for similar but incorrect strings', () => {
      expect(isClerkEventType('user.Created')).toBe(false);
      expect(isClerkEventType('User.created')).toBe(false);
      expect(isClerkEventType('user.create')).toBe(false);
    });
  });
});
