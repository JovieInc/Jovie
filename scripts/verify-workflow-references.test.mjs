import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { afterEach, test } from 'node:test';
import {
  contractChildren,
  contractLines,
  contractMap,
  contractScalar,
  contractSteps,
} from './lib/source-action-contract.mjs';
import { snapshotSourceGuardActions } from './lib/source-guard-action-snapshot.mjs';
import {
  findGhJqArgMisuse,
  validateWorkflowReferences,
} from './verify-workflow-references.mjs';

const temporaryRoots = [];
const { load, dump } = createRequire(import.meta.url)('js-yaml');

afterEach(() => {
  for (const root of temporaryRoots.splice(0))
    fs.rmSync(root, { recursive: true, force: true });
});

test('reports missing local actions, command paths, and workspace filters', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-refs-'));
  temporaryRoots.push(root);
  fs.mkdirSync(path.join(root, '.github', 'workflows'), { recursive: true });
  fs.writeFileSync(
    path.join(root, '.github', 'workflows', 'broken.yml'),
    `
name: broken
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: ./.github/actions/missing
      - run: node scripts/missing.mjs
      - run: pnpm --filter=@missing/app test
`
  );
  fs.writeFileSync(
    path.join(root, 'package.json'),
    JSON.stringify({ name: 'root' })
  );

  assert.deepEqual(validateWorkflowReferences(root), [
    '.github/workflows/broken.yml:7: local action does not resolve: ./.github/actions/missing',
    '.github/workflows/broken.yml:8: command path does not resolve: scripts/missing.mjs',
    '.github/workflows/broken.yml:9: pnpm workspace filter does not resolve: @missing/app',
  ]);
});

test('passes when workflow references resolve', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-refs-'));
  temporaryRoots.push(root);
  fs.mkdirSync(path.join(root, '.github', 'workflows'), { recursive: true });
  fs.mkdirSync(path.join(root, '.github', 'actions', 'setup'), {
    recursive: true,
  });
  fs.mkdirSync(path.join(root, 'scripts'), { recursive: true });
  fs.writeFileSync(
    path.join(root, '.github', 'actions', 'setup', 'action.yml'),
    'name: setup\nruns:\n  using: composite\n  steps: []\n'
  );
  fs.writeFileSync(path.join(root, 'scripts', 'check.mjs'), '');
  fs.writeFileSync(path.join(root, 'apps.json'), '');
  fs.writeFileSync(
    path.join(root, 'package.json'),
    JSON.stringify({ name: 'root' })
  );
  fs.mkdirSync(path.join(root, 'apps', 'web'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'apps', 'web', 'package.json'),
    JSON.stringify({ name: '@actual/web' })
  );
  fs.writeFileSync(
    path.join(root, '.github', 'workflows', 'valid.yml'),
    `
name: valid
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: ./.github/actions/setup
      - run: node scripts/check.mjs
      - run: pnpm --filter=@actual/web test
      - run: git fetch --refetch --filter=blob:limit=1g origin "$BOOTSTRAP_HEAD"
`
  );

  assert.deepEqual(validateWorkflowReferences(root), []);
});

test('validates quoted workspace selectors and exclusions against real package names', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-filters-'));
  temporaryRoots.push(root);
  fs.mkdirSync(path.join(root, '.github', 'workflows'), { recursive: true });
  fs.mkdirSync(path.join(root, 'apps', 'web'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'apps', 'web', 'package.json'),
    JSON.stringify({ name: '@actual/web' })
  );
  const workflow = path.join(root, '.github', 'workflows', 'filters.yml');
  for (const filter of [
    '@actual/web',
    "'@actual/web'",
    '"@actual/web"',
    '!@actual/web',
    "'!@actual/web'",
    '"!@actual/web"',
  ]) {
    fs.writeFileSync(
      workflow,
      `jobs:\n  check:\n    steps:\n      - run: pnpm turbo test:fast --affected --filter=${filter}\n`
    );
    assert.deepEqual(validateWorkflowReferences(root), [], filter);
  }
  for (const filter of [
    '@missing/web',
    "'@missing/web'",
    '!@missing/web',
    "'!@missing/web'",
    '"!@missing/web"',
    "'!@actual/web",
    '!!@actual/web',
    "'!'",
  ]) {
    fs.writeFileSync(
      workflow,
      `jobs:\n  check:\n    steps:\n      - run: pnpm turbo test:fast --affected --filter ${filter}\n`
    );
    const errors = validateWorkflowReferences(root);
    assert.equal(errors.length, 1, filter);
    assert.match(errors[0], /pnpm workspace filter does not resolve/);
  }
});

test('rejects gh --jq combined with --arg (JOV-7698, #20164)', () => {
  const broken = [
    '      - run: |',
    '          id="$(gh api "repos/o/r/actions/runs/1/artifacts?per_page=100" \\',
    '            --jq --arg name "$receipt_name" \\',
    "            '[.artifacts[] | select(.name == $name)] | last | .id')\"",
    '          ok=$(gh issue view 1 --json labels --jq=.labels --argjson n 1)',
  ].join('\n');
  assert.deepEqual(findGhJqArgMisuse(broken), [2, 5]);

  const fixed = [
    '          id="$(gh api \\',
    '            "repos/o/r/actions/artifacts?name=$receipt_name&per_page=100" \\',
    "            --jq '[.artifacts[] | select(.expired == false)] | last | .id // empty')\"",
    "          has=$(gh issue view 1 --json labels | jq -r --arg l x '.labels')",
    '          jq -e --arg sha "$SHA" \'.sha == $sha\' receipt.json',
    "          gh api x --jq '.a | length' && jq --arg n 1 '.' f",
  ].join('\n');
  assert.deepEqual(findGhJqArgMisuse(fixed), []);
});

function generatedFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-generated-'));
  temporaryRoots.push(root);
  const write = (name, contents) => {
    const target = path.join(root, name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, contents);
  };
  const workflowPath = '.github/workflows/source-validation.yml';
  const actual = load(
    fs.readFileSync(new URL(`../${workflowPath}`, import.meta.url), 'utf8')
  );
  const selected = actual.jobs.deterministic.steps.filter(step =>
    [
      'source_guard_actions',
      'source_merge_dependencies',
      'source_merge_browsers',
    ].includes(step.id)
  );
  assert.equal(selected.length, 3);
  const document = {
    jobs: {
      deterministic: {
        steps: [
          { id: 'source_guard_merge', run: 'echo dependency_changed=true' },
          ...selected,
        ],
      },
    },
  };
  write('package.json', '{"name":"fixture"}');
  for (const script of [
    'verify-workflow-references.mjs',
    'lib/source-action-contract.mjs',
  ]) {
    write(
      `scripts/${script}`,
      fs.readFileSync(new URL(script, import.meta.url))
    );
  }
  write(
    'scripts/lib/source-guard-action-snapshot.mjs',
    fs.readFileSync(
      new URL('./lib/source-guard-action-snapshot.mjs', import.meta.url)
    )
  );
  write(
    '.github/actions/setup-node-pnpm/action.yml',
    'runs:\n  using: composite\n  steps:\n    - uses: ./.github/actions/vendor/pnpm-action-setup\n'
  );
  write(
    '.github/actions/setup-playwright/action.yml',
    'runs:\n  using: composite\n  steps: []\n'
  );
  write(
    '.github/actions/vendor/pnpm-action-setup/action.yml',
    'runs:\n  using: node24\n  main: dist/index.js\n  post: dist/index.js\n'
  );
  write(
    '.github/actions/vendor/pnpm-action-setup/dist/index.js',
    'console.log("fixture");\n'
  );
  const save = () => write(workflowPath, dump(document));
  save();
  return { root, write, document, save };
}

test('validates generated actions from their real source closure without creating a snapshot', () => {
  const f = generatedFixture();
  assert.deepEqual(validateWorkflowReferences(f.root), []);
  assert.equal(fs.existsSync(path.join(f.root, 'tmp')), false);
  const before = fs.readFileSync(
    path.join(f.root, '.github/actions/setup-node-pnpm/action.yml')
  );
  assert.deepEqual(validateWorkflowReferences(f.root), []);
  assert.deepEqual(
    fs.readFileSync(
      path.join(f.root, '.github/actions/setup-node-pnpm/action.yml')
    ),
    before
  );
});

test('generated references require the same-job producer, order, and condition', () => {
  const changes = [
    steps => steps.splice(1, 1),
    steps => steps.push(steps.splice(1, 1)[0]),
    steps => {
      steps[1].run = 'echo node scripts/lib/source-guard-action-snapshot.mjs';
    },
    steps => {
      steps[1].if = 'false';
    },
    steps => {
      steps[2].if = 'always()';
    },
    steps => {
      steps[1]['continue-on-error'] = true;
    },
    steps => {
      steps[1]['working-directory'] = 'other';
    },
    steps => steps.splice(0, 1),
    steps => steps.push({ ...steps[2] }),
    steps => {
      steps[2].uses = './tmp/source-guard-actions/unknown';
    },
  ];
  for (const change of changes) {
    const f = generatedFixture();
    change(f.document.jobs.deterministic.steps);
    f.save();
    assert.ok(
      validateWorkflowReferences(f.root).some(error =>
        error.includes('generated action has no valid source and producer')
      )
    );
    assert.equal(fs.existsSync(path.join(f.root, 'tmp')), false);
  }
  const f = generatedFixture();
  f.document.jobs.foreign = {
    steps: [{ ...f.document.jobs.deterministic.steps[2] }],
  };
  f.save();
  assert.ok(
    validateWorkflowReferences(f.root).some(error =>
      error.includes('generated action has no valid source and producer')
    )
  );
});

test('generated references reject missing source closure even when a stale snapshot exists', () => {
  for (const missing of [
    'scripts/lib/source-guard-action-snapshot.mjs',
    '.github/actions/setup-node-pnpm/action.yml',
    '.github/actions/vendor/pnpm-action-setup/action.yml',
    '.github/actions/vendor/pnpm-action-setup/dist/index.js',
  ]) {
    const f = generatedFixture();
    fs.rmSync(path.join(f.root, missing));
    f.write(
      'tmp/source-guard-actions/setup-node-pnpm/action.yml',
      'name: stale\n'
    );
    f.write(
      'tmp/source-guard-actions/setup-playwright/action.yml',
      'name: stale\n'
    );
    const errors = validateWorkflowReferences(f.root);
    assert.ok(
      errors.some(error =>
        error.includes('generated action has no valid source and producer')
      ),
      missing
    );
    assert.equal(
      fs.readFileSync(
        path.join(
          f.root,
          'tmp/source-guard-actions/setup-node-pnpm/action.yml'
        ),
        'utf8'
      ),
      'name: stale\n'
    );
  }
});

test('generated action pre and post payloads must exist inside the copied package', () => {
  for (const [field, payload] of [
    ['post', 'dist/missing-post.js'],
    ['pre', 'dist/missing-pre.js'],
    ['main', '../../setup-node-pnpm/action.yml'],
  ]) {
    const f = generatedFixture();
    const action = {
      runs: { using: 'node24', main: 'dist/index.js', [field]: payload },
    };
    f.write(
      '.github/actions/vendor/pnpm-action-setup/action.yml',
      dump(action)
    );
    assert.ok(
      validateWorkflowReferences(f.root).some(error =>
        error.includes('generated action has no valid source and producer')
      )
    );
    assert.throws(
      () => snapshotSourceGuardActions(f.root),
      /payload does not resolve inside its package/
    );
    assert.equal(fs.existsSync(path.join(f.root, 'tmp')), false);
  }
});

test('the validated closure is the real snapshot and linked or unsupported sources stay invalid', () => {
  const f = generatedFixture();
  const receipt = snapshotSourceGuardActions(f.root);
  assert.deepEqual(receipt.packages, [
    'setup-node-pnpm',
    'setup-playwright',
    'vendor/pnpm-action-setup',
  ]);
  assert.match(
    fs.readFileSync(
      path.join(f.root, receipt.path, 'setup-node-pnpm/action.yml'),
      'utf8'
    ),
    /uses: \.\/tmp\/source-guard-actions\/vendor\/pnpm-action-setup/
  );
  assert.equal(
    fs.readFileSync(
      path.join(f.root, receipt.path, 'vendor/pnpm-action-setup/dist/index.js'),
      'utf8'
    ),
    'console.log("fixture");\n'
  );
  assert.deepEqual(validateWorkflowReferences(f.root), []);
  assert.throws(() => snapshotSourceGuardActions(f.root), /EEXIST/);
  for (const reference of [
    './other/action',
    './.github/actions/../outside',
    './.github/actions/vendor',
  ]) {
    const broken = generatedFixture();
    broken.write(
      '.github/actions/setup-node-pnpm/action.yml',
      `runs:\n  using: composite\n  steps:\n    - uses: ${reference}\n`
    );
    assert.ok(
      validateWorkflowReferences(broken.root).some(error =>
        error.includes('generated action has no valid source and producer')
      )
    );
  }
  for (const at of [
    '.github/actions/setup-node-pnpm',
    '.github/actions/setup-node-pnpm/linked.js',
  ]) {
    const broken = generatedFixture();
    const target = path.join(broken.root, at);
    if (fs.existsSync(target)) fs.rmSync(target, { recursive: true });
    fs.symlinkSync(
      path.join(broken.root, '.github/actions/setup-playwright'),
      target
    );
    assert.ok(
      validateWorkflowReferences(broken.root).some(error =>
        error.includes('generated action has no valid source and producer')
      )
    );
    assert.equal(fs.existsSync(path.join(broken.root, 'tmp')), false);
  }
});

test('cold Node-only checkout validates and snapshots without installed dependencies', () => {
  const f = generatedFixture();
  const run = script =>
    spawnSync(process.execPath, [script], {
      cwd: f.root,
      encoding: 'utf8',
      env: { PATH: '/nonexistent', NODE_PATH: '' },
    });
  assert.equal(fs.existsSync(path.join(f.root, 'node_modules')), false);
  const good = run('scripts/verify-workflow-references.mjs');
  assert.equal(good.status, 0, good.stderr);
  const copied = run('scripts/lib/source-guard-action-snapshot.mjs');
  assert.equal(copied.status, 0, copied.stderr);
  fs.rmSync(
    path.join(f.root, '.github/actions/vendor/pnpm-action-setup/dist/index.js')
  );
  const bad = run('scripts/verify-workflow-references.mjs');
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /generated action has no valid source and producer/);
  assert.doesNotMatch(bad.stderr, /MODULE_NOT_FOUND/);
  assert.equal(fs.existsSync(path.join(f.root, 'node_modules')), false);
});

test('supported workflow fields agree with the canonical YAML parser including quota aliases', () => {
  const source = fs.readFileSync(
    new URL('../.github/workflows/source-validation.yml', import.meta.url),
    'utf8'
  );
  const canonical = load(source);
  const jobs = contractChildren(contractMap(contractLines(source)).get('jobs'));
  const anchors = new Map();
  for (const [id, entry] of jobs) {
    const steps = contractSteps(contractChildren(entry).get('steps'), anchors);
    assert.equal(steps.length, canonical.jobs[id].steps.length);
    for (const [index, step] of steps.entries()) {
      for (const key of [
        'id',
        'uses',
        'if',
        'working-directory',
        'continue-on-error',
      ]) {
        if (step.fields.has(key)) {
          assert.equal(
            contractScalar(step.fields.get(key)),
            canonical.jobs[id].steps[index][key]
          );
        } else assert.equal(canonical.jobs[id].steps[index][key], undefined);
      }
    }
  }
});

test('unknown or ambiguous generated-contract syntax stays red before installation', () => {
  const mutations = [
    source =>
      source.replace(
        'id: source_guard_actions',
        'id: source_guard_actions\n        id: innocent'
      ),
    source =>
      source.replace(
        'id: source_guard_actions',
        "id: source_guard_actions\n        'id': innocent"
      ),
    source => source.replace('jobs:', 'jobs: &jobs'),
    source => source.replace('deterministic:', 'deterministic: &job'),
    source => source.replace('steps:', 'steps: &steps'),
    source =>
      source.replace(
        '- name: Preserve merged action generation',
        '- &producer\n        name: Preserve merged action generation'
      ),
    source =>
      source.replace(
        'run: node scripts/lib/source-guard-action-snapshot.mjs',
        'run: *command'
      ),
    source =>
      source.replace(
        'id: source_guard_actions',
        'id: source_guard_actions\n        <<: *override'
      ),
    source => `${source}\n---\njobs: {}\n`,
    source => `${source}\njobs: {}\n`,
    source =>
      source.replace('id: source_guard_actions', '\tid: source_guard_actions'),
  ];
  for (const mutate of mutations) {
    const f = generatedFixture();
    const file = path.join(f.root, '.github/workflows/source-validation.yml');
    const before = fs.readFileSync(file, 'utf8');
    const after = mutate(before);
    assert.notEqual(after, before, 'control must actually change the workflow');
    fs.writeFileSync(file, after);
    assert.ok(
      validateWorkflowReferences(f.root).some(error =>
        error.includes('generated action has no valid source and producer')
      )
    );
    assert.equal(fs.existsSync(path.join(f.root, 'tmp')), false);
  }
  for (const body of [
    'runs: {using: node24, main: dist/index.js}',
    'runs:\n  using: node24\n  main: dist/index.js\n  main: missing.js',
    'runs:\n  using: node24\n  main: *payload',
    'runs:\n  <<: *runtime\n  using: node24\n  main: dist/index.js',
    'runs:\n  using: composite\n  steps:\n    - *unknown',
  ]) {
    const f = generatedFixture();
    f.write('.github/actions/vendor/pnpm-action-setup/action.yml', body);
    assert.ok(
      validateWorkflowReferences(f.root).some(error =>
        error.includes('generated action has no valid source and producer')
      )
    );
    assert.throws(() => snapshotSourceGuardActions(f.root));
  }
});

test('script-body references never become action dependencies or get rewritten', () => {
  const f = generatedFixture();
  const source =
    'runs:\n  using: composite\n  steps:\n    - shell: bash\n      run: |\n        cat <<EOF\n        uses: ./.github/actions/nonexistent\n        EOF\n';
  f.write('.github/actions/setup-playwright/action.yml', source);
  assert.deepEqual(validateWorkflowReferences(f.root), []);
  snapshotSourceGuardActions(f.root);
  assert.equal(
    fs.readFileSync(
      path.join(f.root, 'tmp/source-guard-actions/setup-playwright/action.yml'),
      'utf8'
    ),
    source
  );
});

test('quoted payloads preserve literal hashes and cannot become truncated filenames', () => {
  for (const quoted of ["'foo # bar'", '"foo # bar"']) {
    const f = generatedFixture();
    f.write(
      '.github/actions/vendor/pnpm-action-setup/action.yml',
      `runs:\n  using: 'node24' # runtime\n  main: ${quoted} # payload\n`
    );
    f.write(".github/actions/vendor/pnpm-action-setup/'foo", 'wrong payload');
    f.write('.github/actions/vendor/pnpm-action-setup/"foo', 'wrong payload');
    assert.throws(
      () => snapshotSourceGuardActions(f.root),
      /payload does not resolve/
    );
    f.write(
      '.github/actions/vendor/pnpm-action-setup/foo # bar',
      'correct payload'
    );
    assert.deepEqual(validateWorkflowReferences(f.root), []);
    snapshotSourceGuardActions(f.root);
  }
  for (const value of [
    "'unclosed",
    '"unclosed',
    "'ok' trailing",
    '"ok" trailing',
  ]) {
    const f = generatedFixture();
    f.write(
      '.github/actions/vendor/pnpm-action-setup/action.yml',
      `runs:\n  using: node24\n  main: ${value}\n`
    );
    f.write(
      `.github/actions/vendor/pnpm-action-setup/${value}`,
      'not a literal filename'
    );
    assert.throws(() => snapshotSourceGuardActions(f.root));
  }
});

test('YAML non-string payloads stay invalid even when a matching filename exists', () => {
  for (const value of [
    'true',
    'FALSE',
    '42',
    '0x10',
    '0o10',
    '1e3',
    'null',
    '~',
    '.NaN',
    '-.Inf',
    '0b10',
    '2026-10-27',
  ]) {
    const f = generatedFixture();
    f.write(
      '.github/actions/vendor/pnpm-action-setup/action.yml',
      `runs:\n  using: node24\n  main: ${value}\n`
    );
    f.write(
      `.github/actions/vendor/pnpm-action-setup/${value}`,
      'wrong typed payload'
    );
    // These last two are strings in the installed YAML core schema, but
    // other YAML schemas coerce them. The bounded contract requires quotes.
    if (!['0b10', '2026-10-27'].includes(value)) {
      assert.notEqual(typeof load(`main: ${value}`).main, 'string');
    }
    assert.throws(
      () => snapshotSourceGuardActions(f.root),
      /Unsupported contract scalar/
    );
    assert.ok(
      validateWorkflowReferences(f.root).some(error =>
        error.includes('generated action has no valid source and producer')
      )
    );
    f.write(
      '.github/actions/vendor/pnpm-action-setup/action.yml',
      `runs:\n  using: node24\n  main: '${value}'\n`
    );
    assert.deepEqual(validateWorkflowReferences(f.root), []);
  }
});

test('unsupported generated references fail explicitly even when lexical scanning cannot see them', () => {
  for (const hide of [
    source => source.replaceAll('uses: ./tmp/', 'uses: &hidden ./tmp/'),
    source => source.replaceAll('uses: ./tmp/', '"uses": ./tmp/'),
    source =>
      source.replace(
        /uses: (\.\/tmp\/[^\n]+)/g,
        (_line, value) => `uses: "${value.replace('./', '\\u002e/')}"`
      ),
    source => source.replace(/uses: \.\/tmp\/[^\n]+/g, 'uses: *unknown'),
  ]) {
    const f = generatedFixture();
    const file = path.join(f.root, '.github/workflows/source-validation.yml');
    const source = fs
      .readFileSync(file, 'utf8')
      .replace(
        'run: node scripts/lib/source-guard-action-snapshot.mjs',
        'run: echo NO_SNAPSHOT_CREATED'
      );
    const hidden = hide(source);
    assert.notEqual(hidden, source);
    fs.writeFileSync(file, hidden);
    fs.rmSync(path.join(f.root, '.github/actions'), { recursive: true });
    assert.ok(
      validateWorkflowReferences(f.root).some(error =>
        error.includes('missing or unsupported contract')
      )
    );
    const cli = spawnSync(
      process.execPath,
      ['scripts/verify-workflow-references.mjs'],
      {
        cwd: f.root,
        encoding: 'utf8',
        env: { PATH: '/nonexistent', NODE_PATH: '' },
      }
    );
    assert.equal(cli.status, 1, cli.stderr);
    assert.match(cli.stderr, /missing or unsupported contract/);
  }
});
