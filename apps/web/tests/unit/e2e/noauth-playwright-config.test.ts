import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const webRoot = resolve(import.meta.dirname, '../../..');
const configPath = resolve(webRoot, 'playwright.config.noauth.ts');

describe('no-auth Playwright config', () => {
  it('does not synthesize an authenticated user for public requests', () => {
    const config = readFileSync(configPath, 'utf8');

    expect(config).not.toContain('x-test-mode');
  });

  it('only collects Playwright specs, not node:test utility suites', () => {
    const config = readFileSync(configPath, 'utf8');

    // tests/e2e/utils contains node:test suites (*.test.mjs) that named-import
    // TypeScript sources; the default *.test.* pattern breaks discovery.
    expect(config).toContain("testMatch: '**/*.spec.ts'");
  });

  it('broad discovery collects at least one spec', () => {
    const output = execFileSync(
      'pnpm',
      [
        'exec',
        'playwright',
        'test',
        '--config=playwright.config.noauth.ts',
        '--list',
      ],
      {
        cwd: webRoot,
        encoding: 'utf8',
        env: {
          ...process.env,
          CI: 'true',
          BASE_URL: 'http://localhost:3100',
          E2E_SKIP_WEB_SERVER: '1',
        },
      }
    );

    const total = /Total: (\d+) tests? in (\d+) files?/.exec(output);
    expect(total, output).not.toBeNull();
    expect(Number(total?.[1])).toBeGreaterThan(0);
  }, 120_000);
});
