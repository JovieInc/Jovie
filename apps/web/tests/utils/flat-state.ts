import { expect } from 'vitest';

/**
 * Card chrome: a fill, border or shadow that sets a box apart. Empty, loading
 * and error states are always flat (see "Card intent: no extra carding" in
 * .claude/rules/ui.md), so none of these may appear on their wrappers.
 */
const CARD_CHROME =
  /^(?:border|border-(?:subtle|default|strong|destructive|error)(?:\/\d+)?|border-\(--[a-z-]+\)|shadow|shadow-(?:card|card-elevated|sm|md|lg|xl|2xl)|bg-surface-[0-3](?:\/\d+)?|bg-\(--app-shell-content-surface\)|(?:dark:)?bg-on-media(?:\/\d+)?|backdrop-blur-\w+|ring-1)$/u;

/**
 * A one-sided border is a hairline divider, and a transparent border only
 * reserves the loaded frame's geometry. Flat states may keep both.
 */
const SIDE_BORDER = /^border-[tblrxyse](?:-\d+)?$/u;
const BORDER_TOKEN = /^border(?:-|$)/u;

const CONTROL_SELECTOR =
  'button, a, input, textarea, select, svg, [role="button"]';

/** Elements under `root` that carry card chrome, excluding real controls. */
export function flatChromeOffenders(root: Element): string[] {
  const offenders: string[] = [];
  for (const element of [root, ...Array.from(root.querySelectorAll('*'))]) {
    if (element.closest(CONTROL_SELECTOR)) continue;
    const tokens = Array.from(element.classList);
    const divider =
      tokens.includes('border-transparent') ||
      tokens.some(token => SIDE_BORDER.test(token));
    const chrome = tokens.filter(
      token =>
        CARD_CHROME.test(token) && !(divider && BORDER_TOKEN.test(token))
    );
    if (chrome.length > 0)
      offenders.push(`${element.tagName.toLowerCase()}: ${chrome.join(' ')}`);
  }
  return offenders;
}

/** Asserts an empty, loading or error state renders no card chrome. */
export function expectFlatState(root: Element): void {
  expect(flatChromeOffenders(root)).toEqual([]);
  expect(root.querySelector('[data-card-intent]')).toBeNull();
}
