import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resolveRealGh, runWithRealGh } from '../real-gh-harness.mjs';

const guard = fileURLToPath(
  new URL('../../changelog-source-guard.mjs', import.meta.url)
);
let checkout, head, eventPath;
beforeAll(() => {
  checkout = mkdtempSync(join(tmpdir(), 'changelog-guard-'));
  const git = (...args) =>
    execFileSync('git', args, { cwd: checkout, encoding: 'utf8' }).trim();
  git('init', '-q');
  git('config', 'user.name', 'Guard test');
  git('config', 'user.email', 'guard@example.invalid');
  git('commit', '--allow-empty', '-qm', 'base');
  const base = git('rev-parse', 'HEAD');
  writeFileSync(join(checkout, 'internal.txt'), 'internal change\n');
  git('add', 'internal.txt');
  git('commit', '-qm', 'head');
  head = git('rev-parse', 'HEAD');
  eventPath = join(checkout, 'event.json');
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
});
afterAll(() => rmSync(checkout, { recursive: true, force: true }));

async function run(responses) {
  let index = 0;
  return runWithRealGh({
    gh: resolveRealGh(),
    script: 'cd "$GUARD_CHECKOUT" && node "$GUARD_SOURCE"',
    env: {
      GUARD_CHECKOUT: checkout,
      GUARD_SOURCE: guard,
      GITHUB_EVENT_PATH: eventPath,
      GITHUB_REPOSITORY: 'JovieInc/Jovie',
    },
    route: path => {
      if (path !== 'repos/JovieInc/Jovie/pulls/20031') return null;
      return responses[Math.min(index++, responses.length - 1)];
    },
  });
}
const current = () => ({
  body: {
    head: { sha: head },
    body: '<!-- customer-changelog/v1 {"releaseWorthy":false} -->',
  },
});

describe('trusted changelog metadata read with real gh', () => {
  it.each([502, 503, 504])(
    'recovers HTTP %i and evaluates current metadata at the exact head',
    async status => {
      const result = await run([
        { status, body: { message: 'temporarily unavailable' } },
        current(),
      ]);
      expect(result.code).toBe(0);
      expect(result.requests).toHaveLength(2);
      expect(JSON.parse(result.stdout)).toMatchObject({ passed: true });
    }
  );
  it('stops after three transient failures without accepting a missing decision', async () => {
    const result = await run([
      { status: 503, body: { message: 'temporarily unavailable' } },
    ]);
    expect(result.code).not.toBe(0);
    expect(result.requests).toHaveLength(3);
    expect(result.stderr).toContain('HTTP 503');
  });
  it.each([401, 403, 404])('fails HTTP %i immediately', async status => {
    const result = await run([
      { status, body: { message: 'permanent failure' } },
    ]);
    expect(result.code).not.toBe(0);
    expect(result.requests).toHaveLength(1);
  });
  it('rejects an advanced head after transient recovery', async () => {
    const result = await run([
      { status: 503, body: {} },
      { body: { ...current().body, head: { sha: 'f'.repeat(40) } } },
    ]);
    expect(result.code).not.toBe(0);
    expect(result.requests).toHaveLength(2);
    expect(result.stderr).toContain('PR head advanced');
  });
  it('does not retry malformed successful metadata', async () => {
    const result = await run([{ body: '{invalid JSON' }]);
    expect(result.code).not.toBe(0);
    expect(result.requests).toHaveLength(1);
  });
});
