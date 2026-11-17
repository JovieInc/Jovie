import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '../../..');
const focusCss = readFileSync(join(ROOT, 'styles/focus.css'), 'utf-8');
const themeCss = readFileSync(join(ROOT, 'styles/theme.css'), 'utf-8');

/** The selector of the section 5 rule that paints a field container's outline. */
function containerOutlineSelector(): string {
  const start = focusCss.indexOf('/* 5.');
  const commentEnd = focusCss.indexOf('*/', start) + 2;
  const braceAt = focusCss.indexOf('{', commentEnd);
  // jsdom matches :focus but not :focus-visible, which is keyboard focus here.
  return focusCss
    .slice(commentEnd, braceAt)
    .replaceAll(':focus-visible', ':focus')
    .replaceAll('\\5b ', '\\[')
    .replaceAll('\\5d ', '\\]');
}

describe('focus canon: field containers', () => {
  it('outlines only the innermost container around a focused field', () => {
    document.body.innerHTML = `
      <form class="w-full focus-within:outline-none" id="form">
        <div class="overflow-hidden focus-within:outline-none" id="surface">
          <textarea id="field"></textarea>
        </div>
      </form>`;
    const field = document.getElementById('field') as HTMLTextAreaElement;
    field.focus();
    const selector = containerOutlineSelector();

    expect(document.getElementById('surface')?.matches(selector)).toBe(true);
    expect(document.getElementById('form')?.matches(selector)).toBe(false);
  });

  it('draws nothing on programmatic focus targets but keeps control outlines', () => {
    const rule = focusCss.match(
      /:where\(\[tabindex="-1"\], \[role="dialog"\], \[role="alertdialog"\]\):focus-visible\s*\{([^}]*)\}/
    );
    expect(rule?.[1]).toContain('outline: none;');
    expect(rule?.[1]).not.toContain('!important');
    expect(focusCss).toMatch(
      /\[role="menuitem"\],[\s\S]*\):focus-visible\s*\{\s*outline: var\(--focus-outline-width\) solid var\(--focus-outline-color\) !important;/
    );
  });

  it('keeps one Clerk focus indicator, the outline, with no extra shadow', () => {
    const clerkFocus = themeCss.match(
      /\.cl-formButtonPrimary\s*\):focus-visible\s*\{([^}]*)\}/
    );
    expect(clerkFocus?.[1]).toContain('box-shadow: none;');
  });
});
