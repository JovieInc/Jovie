import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  FORBIDDEN_USER_VISIBLE_AGENT_BRANDS,
  JOVIE_AGENT_DISPLAY_NAME,
} from '@/lib/brand/agent-display-name';

const WEB_ROOT = join(process.cwd());
const USER_VISIBLE_SCAN_ROOTS = [
  'app',
  'components',
  'content',
  'lib',
  'constants',
] as const;
const SCANNED_EXTENSIONS = new Set(['.ts', '.tsx', '.md', '.mdx', '.json']);
const EXCLUDED_RELATIVE_PATHS = new Set(['lib/brand/agent-display-name.ts']);

function collectScannableFiles(directory: string): string[] {
  const files: string[] = [];

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...collectScannableFiles(absolutePath));
      continue;
    }

    const extension = absolutePath.slice(absolutePath.lastIndexOf('.'));
    if (SCANNED_EXTENSIONS.has(extension)) {
      files.push(absolutePath);
    }
  }

  return files;
}

describe('agent display name brand guard (JOV-3121)', () => {
  it('exports the canonical Jovie agent label', () => {
    expect(JOVIE_AGENT_DISPLAY_NAME).toBe('Jovie agent');
  });

  it('does not leak forbidden Hermes agent wording in user-visible web sources', () => {
    const matches: string[] = [];

    for (const root of USER_VISIBLE_SCAN_ROOTS) {
      const absoluteRoot = join(WEB_ROOT, root);
      if (!statSync(absoluteRoot).isDirectory()) {
        continue;
      }

      for (const absolutePath of collectScannableFiles(absoluteRoot)) {
        const relativePath = relative(WEB_ROOT, absolutePath);
        if (EXCLUDED_RELATIVE_PATHS.has(relativePath)) {
          continue;
        }

        const source = readFileSync(absolutePath, 'utf8');
        for (const pattern of FORBIDDEN_USER_VISIBLE_AGENT_BRANDS) {
          if (source.includes(pattern)) {
            matches.push(`${relativePath}: ${pattern}`);
          }
        }
      }
    }

    expect(matches, matches.join('\n')).toEqual([]);
  });

  it('uses Jovie agent for HUD automation review owner labels', () => {
    const source = readFileSync(join(WEB_ROOT, 'lib/hud/ai-ops.ts'), 'utf8');
    expect(source).toContain('JOVIE_AGENT_DISPLAY_NAME');
    expect(source).not.toMatch(/owner:\s*'Hermes'/);
  });
});