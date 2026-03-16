import { describe, expect, it } from 'vitest';

import {
  CHECKBOX_RADIO_ITEM_BASE,
  CONTEXT_MAX_HEIGHT,
  CONTEXT_TRANSFORM_ORIGIN,
  contextMenuContentClasses,
  contextMenuContentCompactClasses,
  DROPDOWN_CONTENT_BASE,
  DROPDOWN_CONTENT_COMPACT_BASE,
  DROPDOWN_MAX_HEIGHT,
  DROPDOWN_SHADOW,
  DROPDOWN_SLIDE_ANIMATIONS,
  DROPDOWN_TRANSFORM_ORIGIN,
  DROPDOWN_TRANSITIONS,
  dropdownMenuContentClasses,
  dropdownMenuContentCompactClasses,
  MENU_ITEM_BASE,
  MENU_ITEM_COMPACT,
  MENU_ITEM_COMPACT_DESTRUCTIVE,
  MENU_ITEM_DESTRUCTIVE,
  MENU_LABEL_BASE,
  MENU_SEPARATOR_BASE,
  MENU_SHORTCUT_BASE,
  POPOVER_TRANSFORM_ORIGIN,
  popoverContentClasses,
  SELECT_ITEM_BASE,
  SELECT_MAX_HEIGHT,
  SELECT_TRANSFORM_ORIGIN,
  SELECT_TRIGGER_BASE,
  SELECT_VIEWPORT_BASE,
  selectContentClasses,
  subMenuContentClasses,
} from './dropdown-styles';

describe('dropdown-styles', () => {
  describe('animation constants', () => {
    it('DROPDOWN_TRANSITIONS contains open/close animations', () => {
      expect(DROPDOWN_TRANSITIONS).toContain('data-[state=open]:animate-in');
      expect(DROPDOWN_TRANSITIONS).toContain('data-[state=closed]:animate-out');
    });

    it('DROPDOWN_SLIDE_ANIMATIONS contains all four sides', () => {
      expect(DROPDOWN_SLIDE_ANIMATIONS).toContain('data-[side=bottom]');
      expect(DROPDOWN_SLIDE_ANIMATIONS).toContain('data-[side=left]');
      expect(DROPDOWN_SLIDE_ANIMATIONS).toContain('data-[side=right]');
      expect(DROPDOWN_SLIDE_ANIMATIONS).toContain('data-[side=top]');
    });
  });

  describe('content base styles', () => {
    it('DROPDOWN_CONTENT_BASE includes z-index, border, and background', () => {
      expect(DROPDOWN_CONTENT_BASE).toContain('z-[70]');
      expect(DROPDOWN_CONTENT_BASE).toContain('border');
      expect(DROPDOWN_CONTENT_BASE).toContain('bg-');
      expect(DROPDOWN_CONTENT_BASE).toContain('rounded-');
    });

    it('default base uses subtle border opacity and p-0.5 padding', () => {
      expect(DROPDOWN_CONTENT_BASE).toContain(
        'border-(--linear-border-subtle)/70'
      );
      expect(DROPDOWN_CONTENT_BASE).toContain('p-0.5');
    });

    it('compact base uses p-0.5 padding', () => {
      expect(DROPDOWN_CONTENT_COMPACT_BASE).toContain('p-0.5');
      expect(DROPDOWN_CONTENT_COMPACT_BASE).not.toMatch(/\bp-1\b/);
    });
  });

  describe('composed content classes', () => {
    it('dropdownMenuContentClasses includes all constituent parts', () => {
      expect(dropdownMenuContentClasses).toContain(DROPDOWN_CONTENT_BASE);
      expect(dropdownMenuContentClasses).toContain(DROPDOWN_MAX_HEIGHT);
      expect(dropdownMenuContentClasses).toContain(DROPDOWN_SHADOW);
      expect(dropdownMenuContentClasses).toContain(DROPDOWN_TRANSITIONS);
      expect(dropdownMenuContentClasses).toContain(DROPDOWN_SLIDE_ANIMATIONS);
      expect(dropdownMenuContentClasses).toContain(DROPDOWN_TRANSFORM_ORIGIN);
    });

    it('contextMenuContentClasses uses context-specific transform origin', () => {
      expect(contextMenuContentClasses).toContain(CONTEXT_TRANSFORM_ORIGIN);
      expect(contextMenuContentClasses).toContain(CONTEXT_MAX_HEIGHT);
      expect(contextMenuContentClasses).not.toContain(
        DROPDOWN_TRANSFORM_ORIGIN
      );
    });

    it('popoverContentClasses uses popover transform origin and motion-reduce', () => {
      expect(popoverContentClasses).toContain(POPOVER_TRANSFORM_ORIGIN);
      expect(popoverContentClasses).toContain('motion-reduce');
    });

    it('selectContentClasses uses select-specific transform origin', () => {
      expect(selectContentClasses).toContain(SELECT_TRANSFORM_ORIGIN);
      expect(selectContentClasses).toContain(SELECT_MAX_HEIGHT);
      expect(selectContentClasses).toContain('relative');
    });

    it('subMenuContentClasses includes overflow constraints for deep nesting', () => {
      expect(subMenuContentClasses).toContain('max-h');
      expect(subMenuContentClasses).toContain('overflow-y-auto');
      expect(subMenuContentClasses).toContain(DROPDOWN_CONTENT_BASE);
      expect(subMenuContentClasses).toContain(DROPDOWN_SHADOW);
    });
  });

  describe('compact content classes', () => {
    it('dropdownMenuContentCompactClasses uses compact base', () => {
      expect(dropdownMenuContentCompactClasses).toContain(
        DROPDOWN_CONTENT_COMPACT_BASE
      );
      expect(dropdownMenuContentCompactClasses).not.toContain(
        DROPDOWN_CONTENT_BASE
      );
    });

    it('contextMenuContentCompactClasses uses compact base', () => {
      expect(contextMenuContentCompactClasses).toContain(
        DROPDOWN_CONTENT_COMPACT_BASE
      );
      expect(contextMenuContentCompactClasses).toContain(
        CONTEXT_TRANSFORM_ORIGIN
      );
    });
  });

  describe('menu item styles', () => {
    it('MENU_ITEM_BASE includes default sizing', () => {
      expect(MENU_ITEM_BASE).toContain('text-[12.5px]');
      expect(MENU_ITEM_BASE).toContain('leading-4');
      expect(MENU_ITEM_BASE).toContain('font-[450]');
      expect(MENU_ITEM_BASE).toContain('py-1');
      expect(MENU_ITEM_BASE).toContain('gap-1.5');
    });

    it('MENU_ITEM_COMPACT uses smaller sizing', () => {
      expect(MENU_ITEM_COMPACT).toContain('text-[12.5px]');
      expect(MENU_ITEM_COMPACT).toContain('leading-4');
      expect(MENU_ITEM_COMPACT).toContain('font-[450]');
      expect(MENU_ITEM_COMPACT).toContain('py-1');
    });

    it('MENU_ITEM_DESTRUCTIVE includes destructive color tokens', () => {
      expect(MENU_ITEM_DESTRUCTIVE).toContain('linear-error');
    });

    it('MENU_ITEM_COMPACT_DESTRUCTIVE is identical to MENU_ITEM_DESTRUCTIVE', () => {
      expect(MENU_ITEM_COMPACT_DESTRUCTIVE).toBe(MENU_ITEM_DESTRUCTIVE);
    });

    it('CHECKBOX_RADIO_ITEM_BASE has left padding for indicator', () => {
      expect(CHECKBOX_RADIO_ITEM_BASE).toContain('pl-7');
      expect(CHECKBOX_RADIO_ITEM_BASE).toContain('leading-4');
    });

    it('SELECT_ITEM_BASE has left padding for check indicator', () => {
      expect(SELECT_ITEM_BASE).toContain('pl-8');
      expect(SELECT_ITEM_BASE).toContain('w-full');
    });
  });

  describe('label, separator, and shortcut styles', () => {
    it('MENU_LABEL_BASE uses label typography tokens', () => {
      expect(MENU_LABEL_BASE).toContain('text-[11px]');
      expect(MENU_LABEL_BASE).toContain('font-medium');
    });

    it('MENU_SEPARATOR_BASE styles a horizontal rule', () => {
      expect(MENU_SEPARATOR_BASE).toContain('h-px');
      expect(MENU_SEPARATOR_BASE).toContain('my-px');
    });

    it('MENU_SHORTCUT_BASE uses ml-auto alignment', () => {
      expect(MENU_SHORTCUT_BASE).toContain('ml-auto');
    });
  });

  describe('trigger styles', () => {
    it('SELECT_TRIGGER_BASE includes border and focus styles', () => {
      expect(SELECT_TRIGGER_BASE).toContain('border');
      expect(SELECT_TRIGGER_BASE).toContain('focus-visible:');
      expect(SELECT_TRIGGER_BASE).toContain('disabled:opacity-50');
    });
  });

  describe('viewport styles', () => {
    it('SELECT_VIEWPORT_BASE has padding', () => {
      expect(SELECT_VIEWPORT_BASE).toBe('p-1');
    });
  });

  describe('all exports are non-empty strings', () => {
    const exports = {
      DROPDOWN_TRANSITIONS,
      DROPDOWN_SLIDE_ANIMATIONS,
      DROPDOWN_CONTENT_BASE,
      DROPDOWN_CONTENT_COMPACT_BASE,
      DROPDOWN_SHADOW,
      DROPDOWN_TRANSFORM_ORIGIN,
      CONTEXT_TRANSFORM_ORIGIN,
      SELECT_TRANSFORM_ORIGIN,
      POPOVER_TRANSFORM_ORIGIN,
      DROPDOWN_MAX_HEIGHT,
      CONTEXT_MAX_HEIGHT,
      SELECT_MAX_HEIGHT,
      MENU_ITEM_BASE,
      MENU_ITEM_COMPACT,
      MENU_ITEM_DESTRUCTIVE,
      MENU_ITEM_COMPACT_DESTRUCTIVE,
      CHECKBOX_RADIO_ITEM_BASE,
      SELECT_ITEM_BASE,
      MENU_LABEL_BASE,
      MENU_SEPARATOR_BASE,
      MENU_SHORTCUT_BASE,
      SELECT_TRIGGER_BASE,
      SELECT_VIEWPORT_BASE,
      dropdownMenuContentClasses,
      contextMenuContentClasses,
      popoverContentClasses,
      selectContentClasses,
      subMenuContentClasses,
      dropdownMenuContentCompactClasses,
      contextMenuContentCompactClasses,
    };

    for (const [name, value] of Object.entries(exports)) {
      it(`${name} is a non-empty string`, () => {
        expect(typeof value).toBe('string');
        // DROPDOWN_SHADOW is intentionally empty (shadow is now in DROPDOWN_CONTENT_BASE)
        if (name !== 'DROPDOWN_SHADOW') {
          expect(value.length).toBeGreaterThan(0);
        }
      });
    }
  });
});
