import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resolveRealGh, runWithRealGh } from '../real-gh-harness.mjs';

const guard = fileURLToPath(
  new URL('../../changelog-source-guard.mjs', import.meta.url)
);
let checkout, head, eventPath, localPr, localPrPath;
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
  mkdirSync(join(checkout, 'apps/web/lib'), { recursive: true });
  writeFileSync(
    join(checkout, 'apps/web/lib/storefront.ts'),
    'export const country = "jp";\n'
  );
  git('add', 'apps/web/lib/storefront.ts');
  git('commit', '-qm', 'customer change');
  localPr = {
    number: 20031,
    base: { sha: base },
    head: { sha: git('rev-parse', 'HEAD') },
    created_at: '2026-10-03T21:00:00Z',
    body: '## Summary\nStorefront correction\n',
  };
  localPrPath = join(checkout, 'pr.json');
  writeFileSync(localPrPath, JSON.stringify(localPr));
});
afterAll(() => rmSync(checkout, { recursive: true, force: true }));

describe('local customer decision preflight', () => {
  const preflight = (...args) =>
    spawnSync(process.execPath, [guard, ...args], {
      cwd: checkout,
      encoding: 'utf8',
      env: {
        ...process.env,
        GITHUB_ACTIONS: 'false',
        GITHUB_EVENT_PATH: '',
        GH_TOKEN: '',
        GITHUB_TOKEN: '',
      },
    });
  it('rejects missing metadata and validates a proposed body without GitHub credentials', () => {
    const red = preflight('--pr-file', localPrPath);
    expect(red.status).not.toBe(0);
    expect(red.stderr).toContain('missing-metadata');
    const bodyPath = join(checkout, 'body.md');
    writeFileSync(
      bodyPath,
      `${localPr.body}\n<!-- customer-changelog/v1 {"releaseWorthy":false} -->`
    );
    const green = preflight('--pr-file', localPrPath, '--body-file', bodyPath);
    expect(green.status, green.stderr).toBe(0);
    expect(JSON.parse(green.stdout)).toEqual({
      passed: true,
      applicable: true,
      reason: 'internal',
    });
  });
  it('rejects duplicate decisions instead of choosing one', () => {
    const bodyPath = join(checkout, 'duplicate.md');
    writeFileSync(
      bodyPath,
      '<!-- customer-changelog/v1 {"releaseWorthy":false} -->\n'.repeat(2)
    );
    const result = preflight('--pr-file', localPrPath, '--body-file', bodyPath);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('ambiguous');
  });
  it('rejects stale and absent PR snapshots and a body override without a PR', () => {
    const stalePath = join(checkout, 'stale.json');
    writeFileSync(
      stalePath,
      JSON.stringify({ ...localPr, head: { sha: head } })
    );
    expect(preflight('--pr-file', stalePath).stderr).toContain(
      'Local HEAD differs'
    );
    const emptyPath = join(checkout, 'empty.json');
    writeFileSync(emptyPath, '{}');
    expect(preflight('--pr-file', emptyPath).stderr).toContain(
      'Missing exact PR revision evidence'
    );
    writeFileSync(emptyPath, 'null');
    expect(preflight('--pr-file', emptyPath).stderr).toContain(
      'Missing exact PR revision evidence'
    );
    expect(preflight('--body-file', emptyPath).status).not.toBe(0);
  });
  it('cannot override the hosted CI evidence source', () => {
    const result = spawnSync(
      process.execPath,
      [guard, '--pr-file', localPrPath],
      {
        cwd: checkout,
        encoding: 'utf8',
        env: { ...process.env, GITHUB_ACTIONS: 'true' },
      }
    );
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      'Local preflight arguments are unavailable in GitHub Actions'
    );
  });
});

async function run(responses, env = {}, rateLimit = null) {
  let index = 0;
  return runWithRealGh({
    gh: resolveRealGh(),
    script: 'cd "$GUARD_CHECKOUT" && node "$GUARD_SOURCE"',
    env: {
      GUARD_CHECKOUT: checkout,
      GUARD_SOURCE: guard,
      GITHUB_EVENT_PATH: eventPath,
      GITHUB_REPOSITORY: 'JovieInc/Jovie',
      ...env,
    },
    route: path => {
      if (path === 'rate_limit' && rateLimit) return { body: rateLimit() };
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

const quotaExhausted = {
  status: 403,
  body: {
    message:
      'API rate limit exceeded for installation. If you reach out to GitHub Support for help, please include the request ID.',
  },
};
const resetIn = seconds => () => ({
  resources: {
    core: {
      remaining: 0,
      reset: Math.ceil(Date.now() / 1000) + seconds,
    },
    graphql: { remaining: 1000, reset: Math.ceil(Date.now() / 1000) + 3600 },
  },
});

describe('GitHub quota is never a changelog verdict', () => {
  it('spends no API call on a first attempt and judges the event body', async () => {
    const result = await run([current()], { GITHUB_RUN_ATTEMPT: '1' });
    expect(result.requests).toHaveLength(0);
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ passed: true });
  });
  it('defers at once on a re-run that hits the exhausted quota, holding no runner', async () => {
    const result = await run(
      [quotaExhausted, current()],
      { GITHUB_RUN_ATTEMPT: '2' },
      resetIn(3000)
    );
    expect(result.requests.filter(r => !r.endsWith('rate_limit'))).toHaveLength(
      1
    );
    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain('github-quota-deferred');
    expect(result.stderr).not.toContain('Customer outcome decision');
  });
});
