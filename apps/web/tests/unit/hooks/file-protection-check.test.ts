import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const hookPath = resolve(
  process.cwd(),
  '..',
  '..',
  '.claude',
  'hooks',
  'file-protection-check.sh'
);

describe('file-protection-check.sh', () => {
  it('blocks inline chat tool builders in the main chat route', () => {
    const result = spawnSync('bash', [hookPath], {
      encoding: 'utf8',
      env: {
        ...process.env,
        TOOL_INPUT: JSON.stringify({
          file_path: 'apps/web/app/api/chat/route.ts',
          content: `
            import { tool } from 'ai';
            function createAlbumArtTool() {
              return tool({
                execute: async () => ({ success: true }),
              });
            }
          `,
        }),
      },
    });

    expect(result.status).toBe(1);
    expect(`${result.stdout}${result.stderr}`).toMatch(
      /must not define inline chat tools/i
    );
  });

  it('allows extracted tool builders outside the main chat route', () => {
    const result = spawnSync('bash', [hookPath], {
      encoding: 'utf8',
      env: {
        ...process.env,
        TOOL_INPUT: JSON.stringify({
          file_path: 'apps/web/lib/chat/tools/builders.ts',
          content: `
            import { tool } from 'ai';
            export function createAlbumArtTool() {
              return tool({
                execute: async () => ({ success: true }),
              });
            }
          `,
        }),
      },
    });

    expect(result.status).toBe(0);
  });
});
