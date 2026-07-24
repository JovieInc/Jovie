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
  MENU_ICON_TRIGGER_BASE,
  MENU_ITEM_BASE,
  MENU_ITEM_COMPACT,
  MENU_ITEM_COMPACT_DESTRUCTIVE,
  MENU_ITEM_DESTRUCTIVE,
  MENU_LABEL_BASE,
  MENU_OVERFLOW_TRIGGER_BASE,
  MENU_OVERFLOW_TRIGGER_DRAWER,
  MENU_OVERFLOW_TRIGGER_SEGMENT,
  MENU_SEARCH_CLEAR_BUTTON_BASE,
  MENU_SEARCH_ICON_BASE,
  MENU_SEARCH_INPUT_BASE,
  MENU_SEPARATOR_BASE,
  MENU_SHORTCUT_BASE,
  POPOVER_TRANSFORM_ORIGIN,
  popoverContentClasses,
  SELECT_ITEM_BASE,
  SELECT_MAX_HEIGHT,
  SELECT_TRANSFORM_ORIGIN,
  SELECT_TRIGGER_BASE,
  SELECT_VIEWPORT_BASE,
  searchableSubMenuContentClasses,
  selectContentClasses,
  subMenuContentClasses,
} from './dropdown-styles';

describe('dropdown-styles', () => {
  describe('animation constants', () => {
    it('DROPDOWN_TRANSITIONS contains open/close animations', () => {
      expect(DROPDOWN_TRANSITIONS).toContain('data-[state=open]:animate-in');
      expect(DROPDOWN_TRANSITIONS).toContain('data-[state=closed]:animate-out');
      expect(DROPDOWN_TRANSITIONS).toContain('fade-in-0');
      expect(DROPDOWN_TRANSITIONS).not.toContain('zoom');
      expect(DROPDOWN_TRANSITIONS).not.toContain('slide');
    });

    it('DROPDOWN_SLIDE_ANIMATIONS remains disabled for opacity-only motion', () => {
      expect(DROPDOWN_SLIDE_ANIMATIONS).toBe('');
    });
  });

  describe('content base styles', () => {
    it('DROPDOWN_CONTENT_BASE includes z-index, border, and background', () => {
      expect(DROPDOWN_CONTENT_BASE).toContain('z-50');
      expect(DROPDOWN_CONTENT_BASE).toContain('border');
      expect(DROPDOWN_CONTENT_BASE).toContain('bg-surface-0');
      expect(DROPDOWN_CONTENT_BASE).toContain('rounded-xl');
    });

    it('default base uses default border token and p-1 padding', () => {
      expect(DROPDOWN_CONTENT_BASE).toContain('border-default');
      expect(DROPDOWN_CONTENT_BASE.split(/\s+/)).toContain('p-1');
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

    it('popoverContentClasses uses popover transform origin without transform motion', () => {
      expect(popoverContentClasses).toContain(POPOVER_TRANSFORM_ORIGIN);
      expect(popoverContentClasses).not.toContain('zoom');
      expect(popoverContentClasses).not.toContain('slide-in');
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

    it('searchableSubMenuContentClasses uses fixed content sizing without local arbitrary values', () => {
      expect(searchableSubMenuContentClasses).toContain('min-w-72');
      expect(searchableSubMenuContentClasses).toContain('max-w-xs');
      expect(searchableSubMenuContentClasses).toContain('max-h-96');
      expect(searchableSubMenuContentClasses).toContain(DROPDOWN_CONTENT_BASE);
    });
  });

  describe('compact content classes', () => {
    it('dropdownMenuContentCompactClasses uses compact base', () => {
      expect(dropdownMenuContentCompactClasses).toContain(
        DROPDOWN_CONTENT_COMPACT_BASE
      );
      expect(DROPDOWN_CONTENT_COMPACT_BASE).toContain('p-0.5');
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
      expect(MENU_ITEM_BASE).toContain('text-app');
      expect(MENU_ITEM_BASE).toContain('leading-5');
      expect(MENU_ITEM_BASE).toContain('font-normal');
      expect(MENU_ITEM_BASE).toContain('py-1.5');
      expect(MENU_ITEM_BASE).toContain('gap-2');
    });

    it('menu rows use tokenized focus-visible rings', () => {
      expect(MENU_ITEM_BASE).toContain('focus-visible:ring-focus');
      expect(MENU_ITEM_COMPACT).toContain('focus-visible:ring-focus');
      expect(CHECKBOX_RADIO_ITEM_BASE).toContain('focus-visible:ring-focus');
    });

    it('MENU_ITEM_COMPACT uses smaller sizing', () => {
      expect(MENU_ITEM_COMPACT).toContain('text-xs');
      expect(MENU_ITEM_COMPACT).toContain('leading-4');
      expect(MENU_ITEM_COMPACT).toContain('font-normal');
      expect(MENU_ITEM_COMPACT).toContain('py-1');
    });

    it('MENU_ITEM_DESTRUCTIVE includes destructive color tokens', () => {
      expect(MENU_ITEM_DESTRUCTIVE).toContain('text-error');
      expect(MENU_ITEM_DESTRUCTIVE).toContain('bg-error-subtle');
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
      expect(MENU_LABEL_BASE).toContain('text-2xs');
      expect(MENU_LABEL_BASE).toContain('font-medium');
    });

    it('MENU_SEPARATOR_BASE styles a horizontal rule', () => {
      expect(MENU_SEPARATOR_BASE).toContain('h-px');
      expect(MENU_SEPARATOR_BASE).toContain('my-1');
    });

    it('MENU_SHORTCUT_BASE uses ml-auto alignment', () => {
      expect(MENU_SHORTCUT_BASE).toContain('ml-auto');
    });
  });

  describe('trigger styles', () => {
    it('SELECT_TRIGGER_BASE includes border and focus styles', () => {
      expect(SELECT_TRIGGER_BASE).toContain('border');
      expect(SELECT_TRIGGER_BASE).toContain('focus-visible:border-focus');
      expect(SELECT_TRIGGER_BASE).toContain('focus-visible:ring-focus');
      expect(SELECT_TRIGGER_BASE).toContain('disabled:opacity-50');
    });

    it('MENU_ICON_TRIGGER_BASE uses tokenized focus and hover styles', () => {
      expect(MENU_ICON_TRIGGER_BASE).toContain('hover:bg-surface-1');
      expect(MENU_ICON_TRIGGER_BASE).toContain('focus-visible:ring-focus');
    });

    it('overflow trigger variants use tokenized focus and density classes', () => {
      expect(MENU_OVERFLOW_TRIGGER_BASE).toContain('focus-visible:ring-focus');
      expect(MENU_OVERFLOW_TRIGGER_BASE).toContain('ring-offset-surface-page');
      expect(MENU_OVERFLOW_TRIGGER_DRAWER).toContain('min-h-7');
      expect(MENU_OVERFLOW_TRIGGER_SEGMENT).toContain('h-7');
    });
  });

  describe('search styles', () => {
    it('MENU_SEARCH_INPUT_BASE includes shared search field sizing', () => {
      expect(MENU_SEARCH_INPUT_BASE).toContain('h-7');
      expect(MENU_SEARCH_INPUT_BASE).toContain('focus-visible:border-focus');
    });

    it('search icon and clear button avoid transform-based centering', () => {
      expect(MENU_SEARCH_ICON_BASE).toContain('inset-y-0');
      expect(MENU_SEARCH_ICON_BASE).not.toContain('translate');
      expect(MENU_SEARCH_CLEAR_BUTTON_BASE).toContain('inset-y-0');
      expect(MENU_SEARCH_CLEAR_BUTTON_BASE).not.toContain('translate');
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
      MENU_SEARCH_ICON_BASE,
      MENU_SEARCH_INPUT_BASE,
      MENU_SEARCH_CLEAR_BUTTON_BASE,
      MENU_ICON_TRIGGER_BASE,
      MENU_OVERFLOW_TRIGGER_BASE,
      MENU_OVERFLOW_TRIGGER_DRAWER,
      MENU_OVERFLOW_TRIGGER_SEGMENT,
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
      searchableSubMenuContentClasses,
      dropdownMenuContentCompactClasses,
      contextMenuContentCompactClasses,
    };

    for (const [name, value] of Object.entries(exports)) {
      it(`${name} is a non-empty string`, () => {
        expect(typeof value).toBe('string');
        // These exports are intentionally empty compatibility hooks.
        if (
          name !== 'DROPDOWN_SHADOW' &&
          name !== 'DROPDOWN_SLIDE_ANIMATIONS'
        ) {
          expect(value.length).toBeGreaterThan(0);
        }
      });
    }
  });
});
