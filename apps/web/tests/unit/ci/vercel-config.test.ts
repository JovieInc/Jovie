import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const testDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(testDir, '..', '..', '..', '..', '..');

type VercelConfig = {
  functions?: Record<string, unknown>;
  ignoreCommand?: string;
};

function readVercelConfig(relativePath: string): VercelConfig {
  const configPath = resolve(repoRoot, relativePath);
  return JSON.parse(readFileSync(configPath, 'utf8')) as VercelConfig;
}

describe('Vercel function config', () => {
  it('uses App Router function globs that Vercel can match', () => {
    const configs = ['vercel.json', 'apps/web/vercel.json'];

    for (const configPath of configs) {
      const functionGlobs = Object.keys(
        readVercelConfig(configPath).functions ?? {}
      );

      expect(functionGlobs.length, `${configPath} functions`).toBeGreaterThan(
        0
      );
      expect(functionGlobs, configPath).not.toContain('app/api/**/*.ts');
      expect(functionGlobs, configPath).not.toContain(
        'apps/web/app/api/**/*.ts'
      );
      expect(functionGlobs, configPath).not.toContain('apps/web/app/api/**/*');
      expect(functionGlobs, configPath).not.toContain(
        'apps/web/app/api/cron/**/*'
      );
      expect(
        functionGlobs.every(
          glob => glob.startsWith('app/api/') && glob.endsWith('/**/*')
        ),
        configPath
      ).toBe(true);
    }
  });

  it('always builds production branches and delegates preview relevance to turbo-ignore', () => {
    const configs = ['vercel.json', 'apps/web/vercel.json'];
    const ignoreCommands = configs.map(configPath => {
      const command = readVercelConfig(configPath).ignoreCommand;
      expect(command, configPath).toBeTypeOf('string');
      return command as string;
    });

    expect(new Set(ignoreCommands).size).toBe(1);
    const ignoreCommand = ignoreCommands[0];
    const fakeBin = mkdtempSync(resolve(tmpdir(), 'jovie-vercel-ignore-'));
    const fakeNpx = resolve(fakeBin, 'npx');
    writeFileSync(
      fakeNpx,
      '#!/usr/bin/env bash\nprintf "%s\\n" "$*" > "$TURBO_IGNORE_CALL_LOG"\nexit "${TURBO_IGNORE_EXIT_CODE:-0}"\n'
    );
    chmodSync(fakeNpx, 0o755);

    const runIgnoreCommand = (ref: string, exitCode = '0') => {
      const callLog = resolve(fakeBin, `${ref.replaceAll('/', '-')}.log`);
      const result = spawnSync('bash', ['-c', ignoreCommand], {
        env: {
          ...process.env,
          PATH: `${fakeBin}:${process.env.PATH ?? ''}`,
          TURBO_IGNORE_CALL_LOG: callLog,
          TURBO_IGNORE_EXIT_CODE: exitCode,
          VERCEL_GIT_COMMIT_REF: ref,
        },
        encoding: 'utf8',
      });

      return { callLog, result };
    };

    for (const ref of ['main', 'production']) {
      const { callLog, result } = runIgnoreCommand(ref);
      expect(result.status, ref).toBe(1);
      expect(existsSync(callLog), ref).toBe(false);
    }

    for (const ref of [
      'docs-only',
      'codex/docs-only',
      'claude/docs-only',
      'codegen-bot/docs-only',
      'linear/docs-only',
    ]) {
      const { callLog, result } = runIgnoreCommand(ref);
      expect(result.status, ref).toBe(0);
      expect(readFileSync(callLog, 'utf8'), ref).toBe(
        'turbo-ignore @jovie/web\n'
      );
    }
  });
});
