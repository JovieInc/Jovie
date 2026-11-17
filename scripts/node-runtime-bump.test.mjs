import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { bump, latestInMajor, replaceVersion } from './node-runtime-bump.mjs';

const sha = text => createHash('sha256').update(text).digest('hex');
const OLD_TAR = 'a'.repeat(64);
const NEW_TAR = 'b'.repeat(64);
const DIGEST = `sha256:${'c'.repeat(64)}`;
const lookups = {
  tarballSha: async () => NEW_TAR,
  dockerDigest: async () => DIGEST,
  index: async () => [
    { version: 'v26.13.0' },
    { version: 'v24.23.1' },
    { version: 'v24.23.0' },
    { version: 'v24.22.2' },
  ],
};

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'node-bump-'));
  const rule = '---\npaths: ["scripts/setup*"]\n---\n\nUse Node 24.22.2.\n';
  const files = {
    '.nvmrc': '24.22.2\n',
    'package.json': '{"engines":{"node":">=24.22.2 <25"}}\n',
    '.github/runner-image/Dockerfile': `ARG NODE_VERSION=24.22.2\nARG NODE_LINUX_X64_SHA256=${OLD_TAR}\n`,
    '.github/workflows/pr-conflict-handler.yml': `image: 'node:24.22.2-bookworm@sha256:${'d'.repeat(64)}'\n`,
    'apps/web/tests/unit/ci/runner-setup-action.test.ts': `expect(x).toMatch(/v24\\.22\\.2/);\nexpect(y).toContain('${OLD_TAR}');\n`,
    '.claude/rules/environment.md': rule,
    'scripts/agent-context/rule-scopes.json': `{"bodySha256":"${sha('Use Node 24.22.2.\n')}"}\n`,
    'docs/REPOSITORY_SOURCES.md': `- .nvmrc (SHA-256 \`${sha('24.22.2\n')}\`)\n`,
    // Evidence that only quotes a version is history, not a pin.
    'docs/operations/evidence/run.jsonl': '{"node":"24.22.2"}\n',
  };
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), text);
  }
  return root;
}
const read = (root, file) => readFileSync(join(root, file), 'utf8');

test('replaceVersion swaps plain and regex-escaped forms, not longer numbers', () => {
  assert.equal(
    replaceVersion(
      'v24.22.2 24\\.22\\.2 124.22.2 24.22.21',
      '24.22.2',
      '24.23.0'
    ),
    'v24.23.0 24\\.23\\.0 124.22.2 24.22.21'
  );
});

test('latestInMajor ignores other majors and prereleases', () => {
  assert.equal(
    latestInMajor(
      [
        { version: 'v26.1.0' },
        { version: 'v24.9.0' },
        { version: 'v24.10.0' },
        { version: 'v24.11.0-rc.1' },
      ],
      24
    ),
    '24.10.0'
  );
});

test('--latest moves every pin consumer and carries fingerprints forward', async () => {
  const root = fixture();
  const result = await bump({ root, latest: true, lookups });
  assert.equal(result.from, '24.22.2');
  assert.equal(result.to, '24.23.1');
  assert.equal(read(root, '.nvmrc'), '24.23.1\n');
  assert.match(read(root, 'package.json'), />=24\.23\.1 <25/);
  assert.equal(
    read(root, '.github/runner-image/Dockerfile'),
    `ARG NODE_VERSION=24.23.1\nARG NODE_LINUX_X64_SHA256=${NEW_TAR}\n`
  );
  assert.equal(
    read(root, '.github/workflows/pr-conflict-handler.yml'),
    `image: 'node:24.23.1-bookworm@${DIGEST}'\n`
  );
  const contract = read(
    root,
    'apps/web/tests/unit/ci/runner-setup-action.test.ts'
  );
  assert.match(contract, /v24\\\.23\\\.1/);
  assert.match(contract, new RegExp(NEW_TAR));
  assert.equal(
    read(root, 'scripts/agent-context/rule-scopes.json'),
    `{"bodySha256":"${sha('Use Node 24.23.1.\n')}"}\n`
  );
  assert.match(
    read(root, 'docs/REPOSITORY_SOURCES.md'),
    new RegExp(sha('24.23.1\n'))
  );
  assert.equal(
    read(root, 'docs/operations/evidence/run.jsonl'),
    '{"node":"24.22.2"}\n'
  );
});

test('an up-to-date pin changes nothing', async () => {
  const root = fixture();
  const result = await bump({ root, to: '24.22.2', lookups });
  assert.deepEqual(result.changed, []);
  assert.equal(read(root, '.nvmrc'), '24.22.2\n');
});

test('a new major is refused and left to the promotion path', async () => {
  const root = fixture();
  await assert.rejects(bump({ root, to: '26.13.0', lookups }), /new major/);
  assert.equal(read(root, '.nvmrc'), '24.22.2\n');
});
