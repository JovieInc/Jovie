import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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

describe('agent display name brand guard (JOV-3121)', () => {
  it('exports the canonical Jovie agent label', () => {
    expect(JOVIE_AGENT_DISPLAY_NAME).toBe('Jovie agent');
  });

  it('does not leak forbidden Hermes agent wording in user-visible web sources', () => {
    const matches: string[] = [];

    for (const pattern of FORBIDDEN_USER_VISIBLE_AGENT_BRANDS) {
      for (const root of USER_VISIBLE_SCAN_ROOTS) {
        let output = '';
        try {
          output = execFileSync(
            'rg',
            ['-l', pattern, root, '-g', '*.{ts,tsx,md,mdx,json}'],
            { cwd: WEB_ROOT, encoding: 'utf8' }
          ).trim();
        } catch (error) {
          const execError = error as NodeJS.ErrnoException & {
            status?: number;
            stdout?: string;
          };
          if (execError.status === 1) {
            output = (execError.stdout ?? '').trim();
          } else {
            throw error;
          }
        }

        if (!output) continue;
        for (const relativePath of output.split('\n')) {
          if (relativePath === 'lib/brand/agent-display-name.ts') continue;
          matches.push(`${relativePath}: ${pattern}`);
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
