import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  ALLOWLIST_PATH,
  baseCountsAt,
  baseRatchetAt,
  buildRules,
  checkGuard,
  ciBase,
  inScope,
  loadProviders,
  onboardedHits,
  onboardRatchet,
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
    const base = ciBase(repoRoot);
    const baseRatchet = baseRatchetAt(base, repoRoot);
    const baseCounts = baseCountsAt(base, repoRoot, rules, [
      ...Object.keys(found),
      ...Object.keys(ratchet),
    ]);
    expect(
      checkGuard({ found, ratchet, allowlist, baseRatchet, baseCounts })
    ).toEqual([]);
  });

  it('never fails a PR for call sites already on the base revision', () => {
    const path = 'scripts/landed-on-main.mjs';
    const two = scan(
      path,
      "await fetch('https://api.linear.app/graphql');\nawait fetch('https://api.linear.app/graphql');"
    );
    const one = { [path]: { 'provider-host': 1 } };
    const args = { found: two, ratchet: {}, allowlist: [], baseRatchet: {} };
    // main gained two calls after the PR's ratchet was cut: tolerated
    expect(
      checkGuard({ ...args, baseCounts: { [path]: { 'provider-host': 2 } } })
    ).toEqual([]);
    // the PR adds a second call on top of main's one: fails
    expect(checkGuard({ ...args, baseCounts: one })[0]).toMatch(
      /landed-on-main\.mjs:1,2 provider-host: 2 direct call\(s\), 1 grandfathered/
    );
    // main migrated a call away before the PR's ratchet caught up: tolerated
    expect(
      checkGuard({
        found: {},
        ratchet: one,
        allowlist: [],
        baseRatchet: one,
        baseCounts: {},
      })
    ).toEqual([]);
    // the PR itself removed the call without lowering the ratchet: fails
    expect(
      checkGuard({
        found: {},
        ratchet: one,
        allowlist: [],
        baseRatchet: one,
        baseCounts: one,
      })[0]
    ).toMatch(/lower it/);
  });

  it('reads per-file counts from a git revision', () => {
    const head = baseCountsAt('HEAD', repoRoot, rules, [
      'scripts/lanes/doctor.py',
      'does/not/exist.mjs',
    ]);
    expect(
      head?.['scripts/lanes/doctor.py']?.['gh-subprocess']
    ).toBeGreaterThan(0);
    expect(head?.['does/not/exist.mjs']).toBeUndefined();
    expect(baseCountsAt(null, repoRoot, rules, [])).toBeNull();
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

  it('grandfathers existing calls only for a provider newly added to providers.json', () => {
    const head = loadProviders(repoRoot);
    const base = structuredClone(head);
    head.providers.exa = { ...head.providers.vercel, hosts: ['api.exa.ai'] };
    const headRules = buildRules(head);
    const text =
      "fetch('https://api.exa.ai/search');\nfetch('https://api.vercel.com/v1');";
    const found = {
      'scripts/voc.mjs': scanSource('scripts/voc.mjs', text, headRules),
    };
    const baseRatchet = { 'scripts/voc.mjs': { 'provider-host': 1 } };
    const onboarded = onboardedHits(found, base, head, () => text);
    expect(onboarded).toEqual({ 'scripts/voc.mjs': 1 });
    const ratchet = onboardRatchet(baseRatchet, found, onboarded);
    expect(ratchet['scripts/voc.mjs']['provider-host']).toBe(2);
    expect(
      checkGuard({ found, ratchet, allowlist: [], baseRatchet, onboarded })
    ).toEqual([]);
    // Without a provider registration the same growth is rejected.
    expect(
      checkGuard({ found, ratchet, allowlist: [], baseRatchet })[0]
    ).toMatch(/only shrinks/);
    expect(onboardedHits(found, head, head, () => text)).toEqual({});
  });
});
