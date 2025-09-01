/**
 * Tests for the shortcuts validator
 */

import { describe, it, expect } from 'vitest';
import { validateShortcuts, validateShortcut, canShortcutsCoexist } from '@/lib/shortcuts/validator';
import type { Shortcut } from '@/lib/shortcuts/types';

describe('Shortcuts Validator', () => {
  const mockShortcut = (overrides: Partial<Shortcut> = {}): Shortcut => ({
    id: 'test',
    combo: 'cmd+1',
    description: 'Test shortcut',
    handler: () => true,
    scope: 'global',
    ...overrides
  });

  describe('validateShortcut', () => {
    it('should validate a basic shortcut', () => {
      const shortcut = mockShortcut();
      const result = validateShortcut(shortcut);
      
      expect(result.isValid).toBe(true);
      expect(result.conflicts).toHaveLength(0);
    });

    it('should warn about reserved shortcuts', () => {
      const shortcut = mockShortcut({ combo: 'cmd+r' }); // Reload
      const result = validateShortcut(shortcut);
      
      expect(result.isValid).toBe(true);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0].type).toBe('reserved');
    });

    it('should warn about accessibility shortcuts', () => {
      const shortcut = mockShortcut({ combo: 'tab' });
      const result = validateShortcut(shortcut);
      
      expect(result.isValid).toBe(true);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0].type).toBe('accessibility');
    });
  });

  describe('validateShortcuts', () => {
    it('should detect conflicts in same scope', () => {
      const shortcuts: Shortcut[] = [
        mockShortcut({ id: 'test1', combo: 'cmd+1', scope: 'global' }),
        mockShortcut({ id: 'test2', combo: 'cmd+1', scope: 'global' })
      ];
      
      const result = validateShortcuts(shortcuts);
      
      expect(result.isValid).toBe(false);
      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0].severity).toBe('error');
    });

    it('should allow conflicts in different scopes', () => {
      const shortcuts: Shortcut[] = [
        mockShortcut({ id: 'test1', combo: 'cmd+1', scope: 'global' }),
        mockShortcut({ id: 'test2', combo: 'cmd+1', scope: 'modal' })
      ];
      
      const result = validateShortcuts(shortcuts);
      
      expect(result.isValid).toBe(true);
      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0].severity).toBe('warning');
    });

    it('should handle array combos', () => {
      const shortcuts: Shortcut[] = [
        mockShortcut({ id: 'test1', combo: ['cmd+1', 'ctrl+1'], scope: 'global' }),
        mockShortcut({ id: 'test2', combo: 'cmd+1', scope: 'global' })
      ];
      
      const result = validateShortcuts(shortcuts);
      
      expect(result.isValid).toBe(false);
      expect(result.conflicts).toHaveLength(1);
    });
  });

  describe('canShortcutsCoexist', () => {
    it('should allow shortcuts with different combos', () => {
      const shortcut1 = mockShortcut({ combo: 'cmd+1', scope: 'global' });
      const shortcut2 = mockShortcut({ combo: 'cmd+2', scope: 'global' });
      
      expect(canShortcutsCoexist(shortcut1, shortcut2)).toBe(true);
    });

    it('should allow same combo in different scopes', () => {
      const shortcut1 = mockShortcut({ combo: 'cmd+1', scope: 'global' });
      const shortcut2 = mockShortcut({ combo: 'cmd+1', scope: 'modal' });
      
      expect(canShortcutsCoexist(shortcut1, shortcut2)).toBe(true);
    });

    it('should not allow same combo in same scope', () => {
      const shortcut1 = mockShortcut({ combo: 'cmd+1', scope: 'global' });
      const shortcut2 = mockShortcut({ combo: 'cmd+1', scope: 'global' });
      
      expect(canShortcutsCoexist(shortcut1, shortcut2)).toBe(false);
    });
  });
});