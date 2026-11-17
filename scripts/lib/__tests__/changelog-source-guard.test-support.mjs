import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Own an isolated exact-head git fixture for hosted and local guard tests. */
export function createChangelogGuardFixture() {
  const checkout = mkdtempSync(join(tmpdir(), 'changelog-guard-'));
  const git = (...args) =>
    execFileSync('git', args, {
      maxBuffer: 256 * 1024 * 1024,
      cwd: checkout,
      encoding: 'utf8',
    }).trim();
  git('init', '-q');
  git('config', 'user.name', 'Guard test');
  git('config', 'user.email', 'guard@example.invalid');
  git('commit', '--allow-empty', '-qm', 'base');
  const base = git('rev-parse', 'HEAD');
  writeFileSync(join(checkout, 'internal.txt'), 'internal change\n');
  git('add', 'internal.txt');
  git('commit', '-qm', 'head');
  const head = git('rev-parse', 'HEAD');
  const eventPath = join(checkout, 'event.json');
  writeFileSync(
    eventPath,
    JSON.stringify({
      pull_request: {
        number: 20031,
        base: { sha: base },
        head: { sha: head },
        created_at: '2026-10-03T21:00:00Z',
        body: 'outdated event metadata',
      },
    })
  );
  mkdirSync(join(checkout, 'apps/web/lib'), { recursive: true });
  writeFileSync(
    join(checkout, 'apps/web/lib/storefront.ts'),
    'export const country = "jp";\n'
  );
  git('add', 'apps/web/lib/storefront.ts');
  git('commit', '-qm', 'customer change');
  const localPr = {
    number: 20031,
    base: { sha: base },
    head: { sha: git('rev-parse', 'HEAD') },
    created_at: '2026-10-03T21:00:00Z',
    body: '## Summary\nStorefront correction\n',
  };
  const localPrPath = join(checkout, 'pr.json');
  writeFileSync(localPrPath, JSON.stringify(localPr));
  return { checkout, head, eventPath, localPr, localPrPath };
}
