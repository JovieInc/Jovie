import { describe, expect, it } from 'vitest';
import { KEYBOARD_SHORTCUTS } from '@/lib/keyboard-shortcuts';

describe('keyboard shortcuts registry', () => {
  it('has no duplicate shortcutKey values', () => {
    const shortcuts = KEYBOARD_SHORTCUTS.filter(s => s.shortcutKey);
    const seen = new Map<string, string>();
    const duplicates: string[] = [];

    for (const s of shortcuts) {
      const existing = seen.get(s.shortcutKey!);
      if (existing) {
        duplicates.push(
          `"${s.shortcutKey}" is used by both "${existing}" and "${s.id}"`
        );
      }
      seen.set(s.shortcutKey!, s.id);
    }

    expect(duplicates).toEqual([]);
  });

  it('has no duplicate sequential key combos', () => {
    const sequential = KEYBOARD_SHORTCUTS.filter(s => s.isSequential);
    const seen = new Map<string, string>();
    const duplicates: string[] = [];

    for (const s of sequential) {
      const combo = `${s.firstKey}+${s.secondKey}`;
      const existing = seen.get(combo);
      if (existing) {
        duplicates.push(
          `"${combo}" is used by both "${existing}" and "${s.id}"`
        );
      }
      seen.set(combo, s.id);
    }

    expect(duplicates).toEqual([]);
  });

  it('all sequential shortcuts have firstKey and secondKey', () => {
    const sequential = KEYBOARD_SHORTCUTS.filter(s => s.isSequential);
    for (const s of sequential) {
      expect(s.firstKey, `${s.id} missing firstKey`).toBeTruthy();
      expect(s.secondKey, `${s.id} missing secondKey`).toBeTruthy();
    }
  });
});
