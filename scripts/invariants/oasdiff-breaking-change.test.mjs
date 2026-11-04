import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  API_BREAKING_MARKER_RE,
  annotationFor,
  checkOasdiffBreakingChange,
  ensureOasdiffBinary,
  guardFilesChanged,
  OASDIFF_TARBALL_SHA256,
  OASDIFF_VERSION,
  readApiBreakingMarker,
  renderBaseSpec,
  renderSpecAt,
  runOasdiff,
  SPEC_SOURCE_RE,
  specSourcesChanged,
} from './oasdiff-breaking-change.mjs';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const BASE_DOCUMENT = JSON.stringify({
  openapi: '3.0.0',
  info: { title: 'Jovie Artist API', version: '1' },
  paths: {
    '/api/v1/profiles/{handle}': {
      get: {
        responses: {
          200: {
            description: 'ok',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { followers: { type: 'integer' } },
                },
              },
            },
          },
        },
      },
    },
  },
});

function breakingDocument() {
  return JSON.stringify({
    openapi: '3.0.0',
    info: { title: 'Jovie Artist API', version: '2' },
    paths: {
      '/api/v1/profiles/{handle}': {
        get: {
          responses: {
            200: {
              description: 'ok',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: { followers: { type: 'string' } },
                  },
                },
              },
            },
          },
        },
      },
    },
  });
}

const BREAKING_ANNOTATIONS = [
  '::error title=response-property-type-changed,file=/tmp/x/revision-openapi.json::in API GET /api/v1/profiles/{handle} the `followers` property type changed',
];

function harness(overrides = {}) {
  const emitted = [];
  const defaults = {
    eventName: 'pull_request',
    body: null,
    changed: ['apps/web/lib/api/v1/openapi.ts'],
    renderHead: () => ({ code: 0, document: breakingDocument() }),
    renderBase: () => ({ code: 0, document: BASE_DOCUMENT }),
    ensureBinary: () => ({ code: 0, binary: '/usr/bin/true' }),
    diff: () => ({
      code: 1,
      stdout: BREAKING_ANNOTATIONS.join('\n'),
      stderr: '',
    }),
    emit: line => emitted.push(line),
  };
  return {
    run: () => checkOasdiffBreakingChange({ ...defaults, ...overrides }),
    emitted,
  };
}

test('the api-breaking marker requires a non-empty reason on the marker line', () => {
  assert.equal(
    readApiBreakingMarker('api-breaking: followers is now a string handle'),
    'followers is now a string handle'
  );
  assert.equal(
    readApiBreakingMarker('## Notes\napi-breaking: v2 migration, see JOV-1\n'),
    'v2 migration, see JOV-1'
  );
  assert.equal(readApiBreakingMarker('api-breaking:'), null);
  assert.equal(readApiBreakingMarker('api-breaking:   '), null);
  assert.equal(
    readApiBreakingMarker('API-BREAKING: uppercase is not the marker'),
    null
  );
  assert.equal(readApiBreakingMarker('no marker at all'), null);
  assert.equal(readApiBreakingMarker(null), null);
  assert.equal(
    API_BREAKING_MARKER_RE.source.startsWith('^[ \\t]*api-breaking:'),
    true
  );
});

test('spec-source selection matches the contract sources and the guard wiring', () => {
  assert.equal(specSourcesChanged(['apps/web/lib/api/v1/openapi.ts']), true);
  assert.equal(specSourcesChanged(['apps/web/lib/api/v1/contract.ts']), true);
  assert.equal(
    specSourcesChanged(['apps/web/lib/api/public-agent-openapi.ts']),
    true
  );
  assert.equal(
    specSourcesChanged(['apps/web/lib/music-resolver/public-schemas.ts']),
    true
  );
  assert.equal(
    specSourcesChanged(['apps/web/app/api/v1/openapi.json/route.ts']),
    true
  );
  assert.equal(
    specSourcesChanged(['apps/web/app/openapi.json/route.ts']),
    true
  );
  assert.equal(
    specSourcesChanged(['apps/web/scripts/render-public-openapi.ts']),
    true
  );
  assert.equal(
    specSourcesChanged(['apps/web/lib/api/v1/anything-else.ts']),
    true
  );
  assert.equal(
    specSourcesChanged(['apps/web/lib/db/schema/content.ts']),
    false
  );
  assert.equal(specSourcesChanged(['README.md']), false);
  assert.equal(SPEC_SOURCE_RE.test('scripts/ci-fast-lanes.mjs'), true);
  assert.equal(
    guardFilesChanged(['scripts/invariants/oasdiff-breaking-change.mjs']),
    true
  );
  assert.equal(
    guardFilesChanged(['scripts/invariants/oasdiff-breaking-change.test.mjs']),
    true
  );
  assert.equal(guardFilesChanged(['apps/web/lib/api/v1/openapi.ts']), false);
});

test('annotationFor rewrites temp spec paths to the canonical spec source', () => {
  assert.equal(
    annotationFor(
      '::error title=response-property-type-changed,file=/tmp/rev.json::changed'
    ),
    '::error title=response-property-type-changed,file=apps/web/lib/api/v1/openapi.ts::changed'
  );
});

test('breaking changes without a marker fail closed and print every change', () => {
  const { run, emitted } = harness();
  const result = run();
  assert.equal(result.code, 1);
  assert.match(result.reason, /without an api-breaking marker/);
  assert.equal(emitted.length, 2);
  assert.match(
    emitted[0],
    /^::error .*file=apps\/web\/lib\/api\/v1\/openapi\.ts::/
  );
  assert.match(emitted[1], /api-breaking: <reason>/);
});

test('breaking changes with an auditable marker pass and stay visible', () => {
  const { run, emitted } = harness({
    body: 'api-breaking: followers becomes a string handle in v2',
  });
  const result = run();
  assert.equal(result.code, 0);
  assert.match(result.reason, /accepted by marker/);
  assert.equal(
    emitted.some(line => line.startsWith('::error')),
    true
  );
  assert.equal(
    emitted.some(line =>
      line.startsWith('::warning::api-breaking marker accepted')
    ),
    true
  );
});

test('an empty-reason marker does not authorize breaking changes', () => {
  const { run } = harness({ body: 'api-breaking:' });
  assert.equal(run().code, 1);
});

test('a clean diff and additive changes pass', () => {
  const { run, emitted } = harness({
    diff: () => ({ code: 0, stdout: '', stderr: '' }),
  });
  const result = run();
  assert.equal(result.code, 0);
  assert.match(emitted.join('\n'), /no breaking changes/);
});

test('the guard skips when no spec source changed and does not render', () => {
  let rendered = false;
  const { run } = harness({
    changed: ['apps/web/components/site/MarketingFooter.tsx'],
    renderHead: () => {
      rendered = true;
      return { code: 0, document: BASE_DOCUMENT };
    },
  });
  const result = run();
  assert.equal(result.code, 0);
  assert.match(result.reason, /no public OpenAPI spec source changed/);
  assert.equal(rendered, false);
});

test('non-pull_request events are out of scope', () => {
  const { run } = harness({ eventName: 'merge_group' });
  const result = run();
  assert.equal(result.code, 0);
  assert.match(result.reason, /not a pull_request/);
});

test('an unreadable diff fails closed', () => {
  const { run } = harness({ changed: null });
  assert.equal(run().code, 1);
});

test('a crashing oasdiff fails closed instead of passing', () => {
  const { run } = harness({
    diff: () => ({
      code: 102,
      stdout: '',
      stderr: 'failed to load revision spec',
    }),
  });
  const result = run();
  assert.equal(result.code, 1);
  assert.match(result.reason, /exit 102/);
});

test('a failed base render fails closed', () => {
  const { run } = harness({
    renderBase: () => ({
      code: 1,
      error: 'spec render failed in base worktree',
    }),
  });
  assert.equal(run().code, 1);
});

test('guard-file changes trigger the HEAD self-check path', () => {
  let seenBaseRef = null;
  const { run, emitted } = harness({
    changed: [
      'scripts/invariants/oasdiff-breaking-change.mjs',
      'apps/web/lib/api/v1/openapi.ts',
    ],
    renderBase: ref => {
      seenBaseRef = ref;
      return { code: 0, document: breakingDocument() };
    },
    diff: () => ({ code: 0, stdout: '', stderr: '' }),
  });
  const result = run();
  assert.equal(result.code, 0);
  assert.equal(seenBaseRef, 'HEAD');
  assert.match(emitted.join('\n'), /self-check/);
});

test('githubactions breaking invocation does not pass --color', () => {
  const dir = mkdtempSync(join(tmpdir(), 'jovie-oasdiff-args-'));
  const bin = join(dir, 'oasdiff');
  const argsFile = join(dir, 'args');
  writeFileSync(
    bin,
    `#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
writeFileSync(${JSON.stringify(argsFile)}, process.argv.slice(2).join('\\n'));
`
  );
  chmodSync(bin, 0o755);
  try {
    const result = runOasdiff(bin, 'base.json', 'revision.json');
    assert.equal(result.code, 0);
    assert.equal(result.stderr, '');
    assert.deepEqual(readFileSync(argsFile, 'utf8').split('\n'), [
      'breaking',
      'base.json',
      'revision.json',
      '-f',
      'githubactions',
      '--fail-on',
      'ERR',
    ]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the pinned oasdiff release is exact and sha-verified', () => {
  assert.equal(OASDIFF_VERSION, 'v1.34.1');
  assert.match(OASDIFF_TARBALL_SHA256, /^[0-9a-f]{64}$/);
  const fetched = { ok: true, bytes: Buffer.from('not the tarball') };
  const result = ensureOasdiffBinary({
    cacheDir: '/nonexistent-jovie-oasdiff',
    fetchTarball: () => fetched,
  });
  assert.equal(result.code, 1);
  assert.match(result.error, /does not match the pinned/);
});

function specRepository(t) {
  const root = mkdtempSync(join(tmpdir(), 'jovie-oasdiff-tree-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_'))
  );
  const git = (...args) =>
    execFileSync('git', ['-c', 'core.hooksPath=/dev/null', ...args], {
      cwd: root,
      env,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  const spec = join(root, 'apps/web/lib/api/v1/openapi.json');
  mkdirSync(dirname(spec), { recursive: true });
  mkdirSync(join(root, 'apps/web/scripts'), { recursive: true });
  assert.ok(
    existsSync(join(REPO_ROOT, 'apps/web/node_modules/.bin/tsx')),
    'the real renderer requires the installed repository tsx'
  );
  symlinkSync(
    join(REPO_ROOT, 'apps/web/node_modules'),
    join(root, 'apps/web/node_modules'),
    'dir'
  );
  // pnpm's .bin/tsx shim resolves tsx through <root>/node_modules/.pnpm.
  if (existsSync(join(REPO_ROOT, 'node_modules')))
    symlinkSync(
      join(REPO_ROOT, 'node_modules'),
      join(root, 'node_modules'),
      'dir'
    );
  writeFileSync(join(root, '.gitignore'), 'node_modules\n');
  writeFileSync(join(root, 'package.json'), '{"type":"module"}\n');
  writeFileSync(
    join(root, 'apps/web/scripts/render-public-openapi.ts'),
    'import { readFileSync } from "node:fs";\n' +
      'process.stdout.write(readFileSync(new URL("../lib/api/v1/openapi.json", import.meta.url), "utf8"));\n'
  );
  writeFileSync(spec, BASE_DOCUMENT);
  git('init', '-q', '-b', 'main');
  git('config', 'user.name', 'OpenAPI fixture');
  git('config', 'user.email', 'openapi@example.invalid');
  git('add', '.');
  git('commit', '-qm', 'committed public contract');
  git('switch', '-qc', 'source-head');
  writeFileSync(join(root, 'feature.txt'), 'source PR\n');
  git('add', '.');
  git('commit', '-qm', 'source head');
  return { root, git, spec, head: git('rev-parse', 'HEAD') };
}

for (const mode of ['dirty', 'merged']) {
  test(`base snapshot matches committed source with a ${mode} working tree`, t => {
    const fixture = specRepository(t);
    const committed = renderSpecAt(fixture.root, fixture.root);
    assert.equal(committed.code, 0, committed.error);
    assert.equal(committed.document, BASE_DOCUMENT);
    if (mode === 'merged') fixture.git('switch', '-q', 'main');
    writeFileSync(fixture.spec, breakingDocument());
    if (mode === 'merged') {
      fixture.git('add', '.');
      fixture.git('commit', '-qm', 'main contract advances');
      fixture.git('switch', '-q', 'source-head');
      fixture.git('merge', '--no-commit', '--no-ff', 'main');
    }
    const status = fixture.git('status', '--porcelain');
    const working = renderSpecAt(fixture.root, fixture.root);
    const base = renderBaseSpec(fixture.root, 'HEAD');
    assert.equal(working.code, 0, working.error);
    assert.equal(base.code, 0, base.error);
    // Compare the same immutable source generation. Source guards can leave
    // a legitimate uncommitted merge here; it is intentionally a different API.
    assert.equal(base.document, committed.document);
    assert.equal(working.document, breakingDocument());
    assert.notEqual(base.document, working.document);

    const result = checkOasdiffBreakingChange({
      repoRoot: fixture.root,
      baseRef: 'HEAD',
      eventName: 'pull_request',
      body: null,
      changed: ['apps/web/lib/api/v1/openapi.json'],
      ensureBinary: () => ({ code: 0, binary: 'fixture-oasdiff' }),
      diff: (basePath, revisionPath) => {
        assert.equal(readFileSync(basePath, 'utf8'), BASE_DOCUMENT);
        assert.equal(readFileSync(revisionPath, 'utf8'), breakingDocument());
        return { code: 1, stdout: BREAKING_ANNOTATIONS.join('\n'), stderr: '' };
      },
      emit: () => {},
    });
    assert.equal(result.code, 1);
    assert.equal(
      result.reason,
      'breaking changes without an api-breaking marker'
    );
    assert.equal(fixture.git('rev-parse', 'HEAD'), fixture.head);
    assert.equal(fixture.git('status', '--porcelain'), status);
  });
}

test('the renderer produces stable, schema-bearing JSON from the real tree', {
  skip: !existsSync(join(REPO_ROOT, 'apps/web/node_modules/.bin/tsx')),
}, () => {
  const first = renderSpecAt(REPO_ROOT, REPO_ROOT);
  const second = renderSpecAt(REPO_ROOT, REPO_ROOT);
  assert.equal(first.code, 0, first.error);
  assert.equal(second.code, 0, second.error);
  assert.equal(first.document, second.document);
  const parsed = JSON.parse(first.document);
  assert.equal(parsed.info.title.length > 0, true);
  assert.equal(Object.keys(parsed.paths).length > 0, true);
});
