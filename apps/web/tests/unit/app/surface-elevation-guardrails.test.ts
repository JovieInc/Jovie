import { globSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Surface elevation guardrails — prevent invisible cards.
 *
 * The main content area uses bg-(--linear-app-content-surface) (= surface-1).
 * Cards that also use surface-1 WITHOUT border+shadow are invisible.
 * Semi-transparent surface backgrounds (bg-surface-1/XX) are nearly invisible.
 *
 * @see AGENTS.md → "Surface Elevation Rules"
 */

const ROOT = join(__dirname, '../../..');

function findMatches(
  pattern: RegExp,
  globs: string[]
): { file: string; line: number; text: string }[] {
  const results: { file: string; line: number; text: string }[] = [];

  for (const glob of globs) {
    const files = globSync(glob, { cwd: ROOT });
    for (const file of files) {
      const content = readFileSync(join(ROOT, file), 'utf-8');
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (pattern.test(lines[i])) {
          results.push({ file, line: i + 1, text: lines[i].trim() });
        }
      }
    }
  }

  return results;
}

/** Like findMatches but tests the pattern against the full file content,
 *  allowing patterns that span multiple lines. */
function findMultilineMatches(
  pattern: RegExp,
  globs: string[]
): { file: string; line: number; text: string }[] {
  const results: { file: string; line: number; text: string }[] = [];

  for (const glob of globs) {
    const files = globSync(glob, { cwd: ROOT });
    for (const file of files) {
      const content = readFileSync(join(ROOT, file), 'utf-8');
      const globalPattern = new RegExp(
        pattern.source,
        pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g'
      );
      let match: RegExpExecArray | null;
      while ((match = globalPattern.exec(content)) !== null) {
        const line = content.slice(0, match.index).split('\n').length;
        const matchText = match[0].replace(/\n/g, ' ').trim();
        results.push({ file, line, text: matchText });
      }
    }
  }

  return results;
}

const APP_SHELL_GLOBS = [
  'app/app/**/*.tsx',
  'components/molecules/SettingsLoadingSkeleton.tsx',
  'components/organisms/AppShellSkeleton.tsx',
  'components/organisms/table/atoms/TableEmptyState.tsx',
  'components/organisms/EmptyState.tsx',
];

describe('surface elevation guardrails', () => {
  it('does not use semi-transparent bg-surface-1 in app shell (bg-surface-1/XX)', () => {
    // Semi-transparent surface-1 on a surface-1 parent is nearly invisible.
    // Use solid bg-surface-0 for recessed areas instead.
    // Pattern excludes hover/focus pseudo-class prefixes (hover:bg-surface-1/XX is OK)
    const matches = findMatches(
      /(?<!hover:)(?<!focus:)bg-surface-1\/\d/,
      APP_SHELL_GLOBS
    );

    expect(
      matches,
      `Found semi-transparent bg-surface-1/XX in app shell:\n${matches.map(m => `  ${m.file}:${m.line} → ${m.text}`).join('\n')}`
    ).toHaveLength(0);
  });

  it('does not use semi-transparent bg-surface-0 in app shell (bg-surface-0/XX)', () => {
    // Semi-transparent surface-0 should just be solid bg-surface-0.
    const matches = findMatches(
      /(?<!hover:)(?<!focus:)bg-surface-0\/\d/,
      APP_SHELL_GLOBS
    );

    expect(
      matches,
      `Found semi-transparent bg-surface-0/XX in app shell:\n${matches.map(m => `  ${m.file}:${m.line} → ${m.text}`).join('\n')}`
    ).toHaveLength(0);
  });

  it('does not nest DrawerEmptyState inside a card (card-within-card)', () => {
    // DrawerEmptyState should use variant='flat', not variant='card'.
    // It is always rendered inside an existing card container.
    const matches = findMultilineMatches(
      /DrawerEmptyState[\s\S]*?variant=['"]card['"]/,
      ['components/molecules/drawer/DrawerEmptyState.tsx']
    );

    expect(
      matches,
      'DrawerEmptyState should use variant="flat" to avoid card-within-card nesting'
    ).toHaveLength(0);
  });
});
