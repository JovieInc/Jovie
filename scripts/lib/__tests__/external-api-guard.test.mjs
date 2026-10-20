import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  ALLOWLIST_PATH,
  baseRatchetAt,
  buildRules,
  checkGuard,
  ciBase,
  inScope,
  loadProviders,
  RATCHET_PATH,
  readJson,
  scanRepo,
  scanSource,
  tightenRatchet,
} from '../external-api-guard.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const rules = buildRules(loadProviders(repoRoot));
const scan = (path, text) => ({ [path]: scanSource(path, text, rules) });
const check = (found, ratchet = {}, allowlist = [], baseRatchet = null) =>
  checkGuard({ found, ratchet, allowlist, baseRatchet });

describe('external API guard', () => {
  it('holds the live repo to its grandfathered ratchet', () => {
    const found = scanRepo(repoRoot, rules);
    const ratchet = readJson(resolve(repoRoot, RATCHET_PATH), {
      entries: {},
    }).entries;
    const allowlist = readJson(resolve(repoRoot, ALLOWLIST_PATH), {
      entries: [],
    }).entries;
    const baseRatchet = baseRatchetAt(ciBase(repoRoot), repoRoot);
    expect(check(found, ratchet, allowlist, baseRatchet)).toEqual([]);
  });

  it('rejects a new raw fetch to a provider host in TS and Python', () => {
    const ts = scan(
      'apps/web/lib/new.ts',
      "await fetch('https://api.linear.app/graphql', { method: 'POST' });"
    );
    expect(check(ts)[0]).toMatch(
      /apps\/web\/lib\/new\.ts:1 provider-host: 1 direct call\(s\), 0 grandfathered/
    );
    const py = scan(
      'scripts/new.py',
      'urllib.request.urlopen("https://api.github.com/repos/o/r")'
    );
    expect(check(py)).toHaveLength(1);
    const sentryDsn = scan(
      'apps/web/lib/x.ts',
      "const dsn = 'https://o1.ingest.sentry.io/123';"
    );
    expect(check(sentryDsn)).toEqual([]);
  });

  it('rejects new SDK clients and gh subprocesses outside the client layer', () => {
    expect(
      check(
        scan(
          'scripts/a.mjs',
          "import { Octokit } from '@octokit/rest';\nconst o = new Octokit();"
        )
      )[0]
    ).toMatch(/provider-sdk: 2 direct/);
    expect(
      check(scan('scripts/b.ts', "import { LinearClient } from '@linear/sdk';"))
    ).toHaveLength(1);
    expect(
      check(
        scan('scripts/c.py', 'subprocess.run(["gh", "api", "repos/o/r"])')
      )[0]
    ).toMatch(/gh-subprocess/);
    expect(
      check(scan('scripts/d.mjs', "execFileSync('gh', ['pr', 'list']);"))[0]
    ).toMatch(/gh-subprocess/);
    expect(
      check(
        scan('.github/workflows/x.yml', 'run: gh pr list --json number\n')
      )[0]
    ).toMatch(/gh-shell/);
    expect(
      check(
        scan('.github/workflows/y.yml', 'uses: actions/github-script@abc\n')
      )[0]
    ).toMatch(/github-script/);
  });

  it('accepts the client layer and its shell entry point', () => {
    expect(
      check(
        scan(
          '.github/workflows/z.yml',
          'run: node packages/api-client/cli.ts gh --priority poll -- pr list\n'
        )
      )
    ).toEqual([]);
    expect(inScope('packages/api-client/github.ts')).toBe(false);
    expect(inScope('scripts/apiclient/client.py')).toBe(false);
    expect(inScope('scripts/lib/__tests__/x.test.mjs')).toBe(false);
    expect(inScope('apps/web/lib/x.ts')).toBe(true);
  });

  it('lets grandfathered counts shrink but never grow', () => {
    const found = scan('scripts/old.py', '["gh", "api"]\n["gh", "pr"]');
    expect(check(found, { 'scripts/old.py': { 'gh-subprocess': 2 } })).toEqual(
      []
    );
    expect(
      check(found, { 'scripts/old.py': { 'gh-subprocess': 1 } })[0]
    ).toMatch(/2 direct call\(s\), 1 grandfathered/);
    expect(
      check(found, { 'scripts/old.py': { 'gh-subprocess': 3 } })[0]
    ).toMatch(/lower it/);
    expect(
      check(found, { 'scripts/old.py': { 'gh-subprocess': 2 } }, [], {
        'scripts/old.py': { 'gh-subprocess': 1 },
      })[0]
    ).toMatch(/only shrinks/);
    expect(
      tightenRatchet(
        {
          'scripts/old.py': { 'gh-subprocess': 3 },
          'scripts/gone.py': { 'provider-host': 1 },
        },
        found
      )
    ).toEqual({
      'scripts/old.py': { 'gh-subprocess': 2 },
    });
  });

  it('honors justified allowlist caps and rejects unjustified entries', () => {
    const found = scan(
      'scripts/token.py',
      'POST "https://api.github.com/app/installations/1/access_tokens"'
    );
    const entry = {
      path: 'scripts/token.py',
      rule: 'provider-host',
      max: 1,
      reason: 'mints the token the client layer uses',
    };
    expect(check(found, {}, [entry])).toEqual([]);
    expect(check(found, {}, [{ ...entry, reason: 'because' }])[0]).toMatch(
      /needs path, rule, max/
    );
  });
});
