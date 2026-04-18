import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parsePlaywrightIssues } from '../../scripts/overnight-qa/issues';
import type { OvernightSuiteDefinition } from '../../scripts/overnight-qa/types';

const PLAYWRIGHT_SUITE: OvernightSuiteDefinition = {
  id: 'smoke-public',
  label: 'Public Smoke',
  kind: 'playwright',
  priority: 20,
  command: ['pnpm', 'exec', 'playwright', 'test'],
  failureSurface: 'marketing',
};

describe('overnight-qa issues', () => {
  it('parses Playwright failures from noisy json reporter output', async () => {
    const root = await mkdtemp(join(tmpdir(), 'overnight-qa-issues-'));
    const reportPath = join(root, 'smoke-public.json');

    await writeFile(
      reportPath,
      [
        '[dotenv@17.3.1] injecting env (0) from .env.local',
        '{"suites":[{"title":"auth.setup.ts","file":"auth.setup.ts","specs":[{"title":"authenticate","file":"auth.setup.ts","tests":[{"results":[{"status":"timedOut","error":{"message":"Test timeout of 360000ms exceeded."}}]}]}]}]}',
      ].join('\n'),
      'utf8'
    );

    const issues = await parsePlaywrightIssues(PLAYWRIGHT_SUITE, reportPath);

    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      suiteId: 'smoke-public',
      source: 'playwright',
      path: 'auth.setup.ts',
      testFile: 'auth.setup.ts',
    });
    expect(issues[0]?.surface).toBe('auth');
    expect(issues[0]?.summary).toContain('authenticate');
    expect(issues[0]?.signature).toContain('Test timeout');
  });

  it('parses indented Playwright json after noisy setup lines', async () => {
    const root = await mkdtemp(join(tmpdir(), 'overnight-qa-issues-'));
    const reportPath = join(root, 'smoke-public-indented.json');

    await writeFile(
      reportPath,
      [
        '[dotenv@17.3.1] injecting env (0) from .env.local',
        '  {"suites":[{"title":"auth.setup.ts","file":"auth.setup.ts","specs":[{"title":"authenticate","file":"auth.setup.ts","tests":[{"results":[{"status":"failed","error":{"message":"indented json still parsed"}}]}]}]}]}',
      ].join('\n'),
      'utf8'
    );

    const issues = await parsePlaywrightIssues(PLAYWRIGHT_SUITE, reportPath);

    expect(issues).toHaveLength(1);
    expect(issues[0]?.summary).toContain('indented json still parsed');
  });

  it('skips unrelated json logs before the Playwright report', async () => {
    const root = await mkdtemp(join(tmpdir(), 'overnight-qa-issues-'));
    const reportPath = join(root, 'smoke-public-leading-log.json');

    await writeFile(
      reportPath,
      [
        '{"level":"info","message":"setup started"}',
        '{"suites":[{"title":"auth.setup.ts","file":"auth.setup.ts","specs":[{"title":"authenticate","file":"auth.setup.ts","tests":[{"results":[{"status":"failed","error":{"message":"real report still parsed"}}]}]}]}]}',
      ].join('\n'),
      'utf8'
    );

    const issues = await parsePlaywrightIssues(PLAYWRIGHT_SUITE, reportPath);

    expect(issues).toHaveLength(1);
    expect(issues[0]?.summary).toContain('real report still parsed');
  });

  it('parses Playwright reports with unicode escape sequences in messages', async () => {
    const root = await mkdtemp(join(tmpdir(), 'overnight-qa-issues-'));
    const reportPath = join(root, 'smoke-public-unicode.json');

    await writeFile(
      reportPath,
      [
        '[dotenv@17.3.1] injecting env (0) from .env.local',
        '{"suites":[{"title":"auth.setup.ts","file":"auth.setup.ts","specs":[{"title":"authenticate","file":"auth.setup.ts","tests":[{"results":[{"status":"failed","error":{"message":"unicode \\u0022quote\\u0022 still parsed"}}]}]}]}]}',
      ].join('\n'),
      'utf8'
    );

    const issues = await parsePlaywrightIssues(PLAYWRIGHT_SUITE, reportPath);

    expect(issues).toHaveLength(1);
    expect(issues[0]?.summary).toContain('unicode "quote" still parsed');
  });
});
