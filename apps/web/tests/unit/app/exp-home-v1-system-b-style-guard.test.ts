import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const webRoot = path.resolve(__dirname, '../../..');
const sourcePath = 'app/exp/home-v1/page.tsx';

const forbiddenControlPatterns = [
  /\bactive:scale(?:-\[[^\]]+\]|-\d+)?\b/,
  /\bactive:translate(?:-\[[^\]]+\]|-[a-z0-9/[\].-]+)?\b/,
  /\bhover:-translate(?:-\[[^\]]+\]|-[a-z0-9/[\].-]+)?\b/,
  /\bgroup-hover:scale(?:-\[[^\]]+\]|-\d+)?\b/,
  /\btransition-all\b/,
  /\btransition-transform\b/,
  /\btransition-\[[^\]]*transform[^\]]*\]/,
  /\bduration-(?:75|100|150|200|300|500|700|1000)\b/,
  /\b(?:150|200|320)ms\b/,
  /\bhover:brightness-/,
  /\bbg-white\s+text-black\b/,
  /\bshadow-\[/,
];

describe('exp home v1 System B style guard', () => {
  it('keeps visible controls token-backed and non-positional', () => {
    const source = readFileSync(path.join(webRoot, sourcePath), 'utf8');

    for (const pattern of forbiddenControlPatterns) {
      expect(source, `${sourcePath} leaked ${pattern}`).not.toMatch(pattern);
    }

    expect(source).toContain('const CONTROL_FEEDBACK_CLASSES');
    expect(source).toContain(
      'transition-[background-color,border-color,color,box-shadow,opacity] duration-subtle ease-out active:opacity-90'
    );
    expect(source).toContain('const DARK_PRIMARY_CONTROL_CLASSES');
    expect(source).toContain('bg-(--linear-btn-primary-bg)');
    expect(source).toContain('text-(--linear-btn-primary-fg)');
    expect(source).toContain('shadow-(--linear-shadow-button)');
    expect(source).toContain(
      'disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none'
    );
    expect(source).toContain('left-3 right-3');
    expect(source).toContain('sm:left-auto sm:right-4');
    expect(source).toContain('hidden sm:inline');

    const feedbackUsages = source.match(/CONTROL_FEEDBACK_CLASSES/g) ?? [];
    expect(feedbackUsages.length).toBeGreaterThanOrEqual(6);
  });
});
