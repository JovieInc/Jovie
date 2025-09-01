/**
 * Tests for sidebar configuration
 */

import { describe, it, expect } from 'vitest';
import { 
  getPrimaryItems, 
  getSecondaryItems, 
  getAllVisibleItems,
  getShortcutNumber,
  getItemByShortcutNumber,
  getStableAliasTarget,
  SIDEBAR_ITEMS
} from '@/lib/nav/sidebar';

describe('Sidebar Configuration', () => {
  describe('getPrimaryItems', () => {
    it('should return only primary items in order', () => {
      const items = getPrimaryItems();
      
      expect(items.length).toBeGreaterThan(0);
      expect(items.every(item => item.group === 'primary')).toBe(true);
      expect(items.every(item => item.enabled)).toBe(true);
      
      // Check ordering
      for (let i = 1; i < items.length; i++) {
        expect(items[i].position).toBeGreaterThanOrEqual(items[i - 1].position || 0);
      }
    });
  });

  describe('getSecondaryItems', () => {
    it('should return only secondary items in order', () => {
      const items = getSecondaryItems();
      
      expect(items.every(item => item.group === 'secondary')).toBe(true);
      expect(items.every(item => item.enabled)).toBe(true);
    });
  });

  describe('getShortcutNumber', () => {
    it('should return correct shortcut numbers for primary items', () => {
      const primaryItems = getPrimaryItems();
      
      primaryItems.forEach((item, index) => {
        const expectedNumber = index + 1;
        if (expectedNumber <= 9) {
          expect(getShortcutNumber(item.id)).toBe(expectedNumber);
        } else {
          expect(getShortcutNumber(item.id)).toBeNull();
        }
      });
    });

    it('should return null for non-existent items', () => {
      expect(getShortcutNumber('non-existent')).toBeNull();
    });

    it('should return null for secondary items (no numeric shortcuts)', () => {
      const secondaryItems = getSecondaryItems();
      
      secondaryItems.forEach(item => {
        // Secondary items shouldn't have numeric shortcuts unless they're in top 9
        const allItems = getAllVisibleItems();
        const globalIndex = allItems.findIndex(i => i.id === item.id);
        
        if (globalIndex >= 9) {
          expect(getShortcutNumber(item.id)).toBeNull();
        }
      });
    });
  });

  describe('getItemByShortcutNumber', () => {
    it('should return correct item for valid numbers', () => {
      const primaryItems = getPrimaryItems();
      
      for (let i = 1; i <= Math.min(primaryItems.length, 9); i++) {
        const item = getItemByShortcutNumber(i);
        expect(item).toBeDefined();
        expect(item?.id).toBe(primaryItems[i - 1].id);
      }
    });

    it('should return null for invalid numbers', () => {
      expect(getItemByShortcutNumber(0)).toBeNull();
      expect(getItemByShortcutNumber(10)).toBeNull();
      expect(getItemByShortcutNumber(-1)).toBeNull();
    });
  });

  describe('getStableAliasTarget', () => {
    it('should return correct target for links alias', () => {
      expect(getStableAliasTarget('cmd+l')).toBe('links');
      expect(getStableAliasTarget('ctrl+l')).toBe('links');
    });

    it('should return correct target for analytics alias', () => {
      expect(getStableAliasTarget('cmd+g')).toBe('analytics');
      expect(getStableAliasTarget('ctrl+g')).toBe('analytics');
    });

    it('should return null for non-alias combos', () => {
      expect(getStableAliasTarget('cmd+1')).toBeNull();
      expect(getStableAliasTarget('cmd+z')).toBeNull();
    });

    it('should be case insensitive', () => {
      expect(getStableAliasTarget('CMD+L')).toBe('links');
      expect(getStableAliasTarget('Cmd+G')).toBe('analytics');
    });
  });

  describe('SIDEBAR_ITEMS', () => {
    it('should have all required fields', () => {
      SIDEBAR_ITEMS.forEach(item => {
        expect(item.id).toBeTruthy();
        expect(item.name).toBeTruthy();
        expect(item.label).toBeTruthy();
        expect(item.href).toBeTruthy();
        expect(item.icon).toBeDefined();
        expect(item.description).toBeTruthy();
        expect(['primary', 'secondary', 'utility']).toContain(item.group);
        expect(typeof item.enabled).toBe('boolean');
        expect(typeof item.position).toBe('number');
      });
    });

    it('should have unique IDs', () => {
      const ids = SIDEBAR_ITEMS.map(item => item.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    it('should have unique positions', () => {
      const positions = SIDEBAR_ITEMS.map(item => item.position);
      const uniquePositions = new Set(positions);
      expect(uniquePositions.size).toBe(positions.length);
    });
  });
});