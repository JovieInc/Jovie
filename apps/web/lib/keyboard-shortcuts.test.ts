import { describe, expect, it } from 'vitest';
import {
  KEYBOARD_SHORTCUTS,
  NAV_SHORTCUTS,
  SHORTCUT_CATEGORY_LABELS,
  type ShortcutCategory,
} from './keyboard-shortcuts';

describe('keyboard-shortcuts definitions', () => {
  it('has unique ids', () => {
    const ids = KEYBOARD_SHORTCUTS.map(s => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has unique key combinations', () => {
    const keys = KEYBOARD_SHORTCUTS.map(s => s.keys);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('has a label for every shortcut', () => {
    for (const shortcut of KEYBOARD_SHORTCUTS) {
      expect(shortcut.label).toBeTruthy();
    }
  });

  it('has a category for every shortcut', () => {
    const validCategories: ShortcutCategory[] = [
      'general',
      'navigation',
      'actions',
    ];
    for (const shortcut of KEYBOARD_SHORTCUTS) {
      expect(validCategories).toContain(shortcut.category);
    }
  });

  it('has category labels for all category types', () => {
    expect(SHORTCUT_CATEGORY_LABELS.general).toBe('General');
    expect(SHORTCUT_CATEGORY_LABELS.navigation).toBe('Navigation');
    expect(SHORTCUT_CATEGORY_LABELS.actions).toBe('Actions');
  });

  describe('sequential shortcuts', () => {
    const sequential = KEYBOARD_SHORTCUTS.filter(s => s.isSequential);

    it('all have firstKey, secondKey, and href', () => {
      for (const s of sequential) {
        expect(s.firstKey).toBeTruthy();
        expect(s.secondKey).toBeTruthy();
        expect(s.href).toBeTruthy();
      }
    });

    it('all have keys in "X then Y" format', () => {
      for (const s of sequential) {
        expect(s.keys).toMatch(/^[A-Z] then [A-Z]$/);
      }
    });

    it('has unique second keys within the same first key', () => {
      const grouped = new Map<string, string[]>();
      for (const s of sequential) {
        const group = grouped.get(s.firstKey!) ?? [];
        group.push(s.secondKey!);
        grouped.set(s.firstKey!, group);
      }
      for (const [, secondKeys] of grouped) {
        expect(new Set(secondKeys).size).toBe(secondKeys.length);
      }
    });

    it('contains expected navigation shortcuts', () => {
      const ids = sequential.map(s => s.id);
      expect(ids).toContain('nav-dashboard');
      expect(ids).toContain('nav-profile');
      expect(ids).toContain('nav-contacts');
      expect(ids).toContain('nav-releases');
      expect(ids).toContain('nav-tour-dates');
      expect(ids).toContain('nav-audience');
      expect(ids).toContain('nav-earnings');
      expect(ids).toContain('nav-chat');
      expect(ids).toContain('nav-settings');
    });
  });

  describe('modifier shortcuts', () => {
    const modifier = KEYBOARD_SHORTCUTS.filter(
      s => !s.isSequential && s.shortcutKey
    );

    it('does not conflict with browser Ctrl+C/V/X/A/Z', () => {
      const browserReserved = [
        'Meta+c',
        'Meta+v',
        'Meta+x',
        'Meta+a',
        'Meta+z',
        'Ctrl+c',
        'Ctrl+v',
        'Ctrl+x',
        'Ctrl+a',
        'Ctrl+z',
      ];
      for (const s of modifier) {
        expect(browserReserved).not.toContain(s.shortcutKey);
      }
    });

    it('does not conflict with browser tab/window management', () => {
      const tabShortcuts = [
        'Meta+t',
        'Meta+w',
        'Meta+n',
        'Ctrl+t',
        'Ctrl+w',
        'Ctrl+n',
        'Meta+Shift+t',
        'Ctrl+Shift+t',
      ];
      for (const s of modifier) {
        expect(tabShortcuts).not.toContain(s.shortcutKey);
      }
    });
  });

  describe('NAV_SHORTCUTS map', () => {
    it('maps all expected sidebar nav items', () => {
      expect(NAV_SHORTCUTS.overview).toBeDefined();
      expect(NAV_SHORTCUTS.profile).toBeDefined();
      expect(NAV_SHORTCUTS.contacts).toBeDefined();
      expect(NAV_SHORTCUTS.releases).toBeDefined();
      expect(NAV_SHORTCUTS.touring).toBeDefined();
      expect(NAV_SHORTCUTS.audience).toBeDefined();
      expect(NAV_SHORTCUTS.earnings).toBeDefined();
      expect(NAV_SHORTCUTS.chat).toBeDefined();
      expect(NAV_SHORTCUTS.account).toBeDefined();
    });

    it('references valid shortcuts from KEYBOARD_SHORTCUTS', () => {
      for (const shortcut of Object.values(NAV_SHORTCUTS)) {
        expect(KEYBOARD_SHORTCUTS).toContain(shortcut);
      }
    });
  });

  describe('help menu completeness', () => {
    it('includes theme toggle shortcut bound to Alt+T (no bare letter)', () => {
      const themeShortcut = KEYBOARD_SHORTCUTS.find(
        s => s.id === 'toggle-theme'
      );
      expect(themeShortcut).toBeDefined();
      expect(themeShortcut!.shortcutKey).toBe('Alt+t');
      // Display label uses the option glyph; keep the assertion loose so the
      // exact glyph is documented in keyboard-shortcuts.ts only.
      expect(themeShortcut!.keys).toMatch(/T$/);
    });

    it('includes sidebar toggle shortcut', () => {
      const sidebarShortcut = KEYBOARD_SHORTCUTS.find(
        s => s.id === 'toggle-sidebar'
      );
      expect(sidebarShortcut).toBeDefined();
    });

    it('includes command menu shortcut', () => {
      const commandShortcut = KEYBOARD_SHORTCUTS.find(
        s => s.id === 'command-menu'
      );
      expect(commandShortcut).toBeDefined();
    });

    it('includes keyboard shortcuts help shortcut', () => {
      const helpShortcut = KEYBOARD_SHORTCUTS.find(
        s => s.id === 'keyboard-shortcuts'
      );
      expect(helpShortcut).toBeDefined();
    });

    it('every shortcut has an icon', () => {
      for (const shortcut of KEYBOARD_SHORTCUTS) {
        expect(shortcut.icon).toBeDefined();
      }
    });
  });

  describe('chord conflict detection (JOV-1827)', () => {
    it('has no duplicate `shortcutKey` chord (canonicalized)', () => {
      // Canonicalize so semantically identical chords with different
      // casing/modifier order can't slip through (e.g. "Alt+Shift+Q" vs
      // "Shift+Alt+q").
      const normalizeChord = (chord: string) => {
        const parts = chord
          .split('+')
          .map(p => p.trim())
          .filter(Boolean);
        const key = (parts.pop() ?? '').toLowerCase();
        const modifiers = parts
          .map(m => `${m[0]?.toUpperCase() ?? ''}${m.slice(1).toLowerCase()}`)
          .sort();
        return [...modifiers, key].join('+');
      };
      const chords = KEYBOARD_SHORTCUTS.filter(s => s.shortcutKey).map(s =>
        normalizeChord(s.shortcutKey!)
      );
      expect(new Set(chords).size).toBe(chords.length);
    });

    it('does not advertise bare single-letter chords for action shortcuts', () => {
      // Bare letters get swallowed by inputs; require a modifier.
      for (const s of KEYBOARD_SHORTCUTS) {
        if (s.category !== 'actions' || !s.shortcutKey) continue;
        expect(s.shortcutKey).toMatch(/(Meta|Ctrl|Alt|Shift)\+/);
      }
    });

    it('sequential first keys do not collide with single-key chords', () => {
      const chords = new Set(
        KEYBOARD_SHORTCUTS.filter(
          s => s.shortcutKey && !s.shortcutKey.includes('+')
        ).map(s => s.shortcutKey!.toLowerCase())
      );
      const sequentialFirsts = new Set(
        KEYBOARD_SHORTCUTS.filter(s => s.isSequential && s.firstKey).map(s =>
          s.firstKey!.toLowerCase()
        )
      );
      for (const f of sequentialFirsts) {
        expect(chords.has(f)).toBe(false);
      }
    });

    it('every overlay shortcut has a known wiring location', () => {
      // Document handler ownership in code so removals fail this test.
      const HANDLED: Record<string, string> = {
        'command-menu': 'CommandPalette.tsx',
        'keyboard-shortcuts': 'useSequentialShortcuts',
        'toggle-sidebar': 'useSidebarKeyboardShortcut',
        'toggle-theme': 'useGlobalShortcutActions',
        'sign-out': 'useGlobalShortcutActions',
        'nav-dashboard': 'useSequentialShortcuts',
        'nav-profile': 'useSequentialShortcuts',
        'nav-contacts': 'useSequentialShortcuts',
        'nav-releases': 'useSequentialShortcuts',
        'nav-tour-dates': 'useSequentialShortcuts',
        'nav-audience': 'useSequentialShortcuts',
        'nav-earnings': 'useSequentialShortcuts',
        'nav-chat': 'useSequentialShortcuts',
        'nav-settings': 'useSequentialShortcuts',
      };
      for (const s of KEYBOARD_SHORTCUTS) {
        expect(HANDLED[s.id]).toBeTruthy();
      }
    });
  });
});
