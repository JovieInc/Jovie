import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  isolationOffIn,
  jobsIn,
  networkIn,
  RATCHET_PATH,
  RATCHET_SCHEMA,
  RULES,
  runnerImageIn,
  runnerToolsIn,
  scan,
  seedsIn,
  sharedStateIn,
  tighten,
  unpinnedIn,
  violations,
} from '../../hermetic-ci-guard.mjs';

const ROOT = new URL('../../../', import.meta.url);
const SHA = 'a'.repeat(40);
// Built at run time so this file holds no fixed temp path of its own.
const FIXED = ['', 'tmp', 'out.json'].join('/');

describe('hermetic-ci-guard', () => {
  it('network: flags a live host, passes loopback, reserved names and a replaced transport', () => {
    expect(networkIn("await fetch('https://api.github.com/zen');")).toBe(1);
    expect(
      networkIn('r = requests.get("https://pypi.org/simple/")\n', 'py')
    ).toBe(1);
    expect(networkIn("await fetch('http://localhost:3000/api');")).toBe(0);
    expect(networkIn("await fetch('http://127.0.0.1:9/x');")).toBe(0);
    expect(networkIn("await fetch('https://api.example.com/x');")).toBe(0);
    expect(networkIn("await fetch('https://jovie.test/x');")).toBe(0);
    expect(networkIn('await fetch(`${baseUrl}/x`);')).toBe(0);
    expect(
      networkIn(
        "vi.stubGlobal('fetch', vi.fn());\nawait fetch('https://api.github.com/zen');"
      )
    ).toBe(0);
    expect(
      networkIn(
        'with patch("requests.get"):\n    requests.get("https://pypi.org/simple/")\n',
        'py'
      )
    ).toBe(0);
    expect(
      networkIn("// fetch('https://api.github.com/zen')\nconst a = 1;")
    ).toBe(0);
  });

  it('seeds: flags unseeded draws, passes a seeded or replaced generator', () => {
    expect(seedsIn('const id = Math.random();')).toBe(1);
    expect(
      seedsIn("vi.spyOn(Math, 'random').mockReturnValue(0.5);\nMath.random();")
    ).toBe(0);
    expect(
      seedsIn('x = random.choice(items)\ny = random.randint(1, 9)\n', 'py')
    ).toBe(2);
    expect(seedsIn('random.seed(1234)\nx = random.choice(items)\n', 'py')).toBe(
      0
    );
    expect(
      seedsIn('rng = random.Random(7)\nx = random.choice(items)\n', 'py')
    ).toBe(0);
  });

  it('shared-state: flags a fixed /tmp path and isolation-off switches', () => {
    expect(sharedStateIn(`writeFileSync('${FIXED}', '{}');`)).toBe(1);
    expect(
      sharedStateIn("const dir = mkdtempSync(join(tmpdir(), 'x-'));")
    ).toBe(0);
    expect(sharedStateIn(`// '${FIXED}'\nconst a = 1;`)).toBe(0);
    expect(isolationOffIn('node --test --test-isolation=none a.test.mjs')).toBe(
      1
    );
    expect(isolationOffIn('export default { test: { isolate: false } };')).toBe(
      1
    );
    expect(isolationOffIn('sequence: { shuffle: true }')).toBe(1);
    expect(isolationOffIn('node --test a.test.mjs')).toBe(0);
  });

  it('unpinned: flags floating action refs and floating installs only', () => {
    const pinned = [
      'jobs:',
      '  a:',
      '    steps:',
      `      - uses: actions/checkout@${SHA} # v7`,
      '      - uses: ./.github/actions/setup-node-pnpm',
      `      - uses: docker://ghcr.io/x/y@sha256:${'b'.repeat(64)}`,
      '      - run: pnpm install --frozen-lockfile',
      '      - run: python -m pip install --require-hashes -r requirements.txt',
      '      - run: npx playwright test # lockfile bin; @latest in a comment',
    ].join('\n');
    expect(unpinnedIn(pinned)).toBe(0);
    for (const line of [
      '      - uses: actions/checkout@v7',
      '      - uses: actions/checkout@main',
      '      - run: pip install semgrep==1.2.3',
      '      - run: npm install -g vercel',
      '      - run: npm install -g vercel@latest',
      '      - run: pnpm dlx some-tool',
      '      - run: npx --yes some-tool',
      '      - run: curl -fsSL https://x.sh | bash',
      '      - run: sudo apt-get install -y jq',
      '      - run: docker pull alpine:latest',
    ])
      expect(unpinnedIn(`${pinned}\n${line}`), line).toBeGreaterThanOrEqual(1);
    expect(unpinnedIn(`${pinned}\n      - run: pnpm dlx some-tool@1.2.3`)).toBe(
      0
    );
    expect(
      unpinnedIn(`${pinned}\n      - run: npm install -g vercel@56.3.2`)
    ).toBe(0);
  });

  it('runner-image and runner-tools: floating images and unprovisioned toolchains', () => {
    expect(runnerImageIn('    runs-on: ubuntu-latest\n')).toBe(1);
    expect(runnerImageIn('    runs-on: [self-hosted, macos-latest]\n')).toBe(1);
    expect(
      runnerImageIn('    runs-on: ubuntu-24.04 # not ubuntu-latest\n')
    ).toBe(0);
    const workflow = [
      'name: x',
      'jobs:',
      '  provisioned:',
      '    steps:',
      `      - uses: actions/setup-node@${SHA}`,
      `      - uses: actions/setup-python@${SHA}`,
      `      - uses: actions/setup-go@${SHA}`,
      '      - run: node a.mjs && python3 b.py && go test ./...',
      '  bare:',
      '    steps:',
      '      - name: go test is only a name here',
      '      - run: |',
      '          node a.mjs',
      '          python3 b.py',
      '  linter:',
      '    steps:',
      '      - run: shellcheck scripts/*.sh',
    ].join('\n');
    expect(jobsIn(workflow)).toHaveLength(3);
    // bare: node + python; linter: image shellcheck.
    expect(runnerToolsIn(workflow)).toBe(3);
  });

  it('flags growth and new files per rule, and only shrinks the ratchet', () => {
    const counts = { network: { a: 2, b: 1 }, seeds: { c: 1 } };
    const ratchet = { network: { a: 1 }, seeds: { c: 3, d: 1 } };
    expect(violations(counts, ratchet)).toEqual([
      { rule: 'network', file: 'a', found: 2, allowed: 1 },
      { rule: 'network', file: 'b', found: 1, allowed: 0 },
    ]);
    const next = tighten(counts, ratchet);
    expect(next.network).toEqual({ a: 1 });
    expect(next.seeds).toEqual({ c: 1 });
    expect(Object.keys(next)).toEqual(Object.keys(RULES));
  });

  it('keeps the committed ratchet at or above what the tree holds today', () => {
    const ratchet = JSON.parse(
      readFileSync(new URL(RATCHET_PATH, ROOT), 'utf8')
    );
    expect(ratchet.schema).toBe(RATCHET_SCHEMA);
    expect(Object.keys(ratchet.entries)).toEqual(Object.keys(RULES));
    const files = [
      ...new Set(Object.values(ratchet.entries).flatMap(Object.keys)),
    ];
    expect(violations(scan(ROOT.pathname, files), ratchet.entries)).toEqual([]);
  });

  it('names every invariant in the contract doc', () => {
    const doc = readFileSync(
      new URL('.claude/rules/hermetic-ci.md', ROOT),
      'utf8'
    );
    for (const rule of Object.keys(RULES)) expect(doc).toContain(`\`${rule}\``);
    expect(doc).toContain('scripts/wall-clock-test-guard.mjs');
    expect(doc).toContain('scripts/hermetic-ci-guard.mjs');
  });
});
