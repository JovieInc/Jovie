import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  artifactSnapshot,
  bindDeployment,
  buildSbom,
  captureArtifact,
  captureInputs,
  compareSources,
  sourceSnapshot,
} from './production-input-provenance.mjs';

test('workflow reads deployment API metadata before binding rather than the inspect display projection', t => {
  const f = fixture(t);
  const workflow = readFileSync(
    new URL('../workflows/production-release.yml', import.meta.url),
    'utf8'
  );
  const start = workflow.indexOf('          if ! production_deploy_json=');
  const end = workflow.indexOf('          inspected_id=', start);
  assert.ok(start >= 0 && end > start);
  const readDeployment = workflow.slice(start, end);
  const bin = resolve(f.root, 'node_modules/.bin');
  mkdirSync(bin, { recursive: true });
  const cli = resolve(bin, 'vercel');
  const argvPath = resolve(f.base, 'argv.json');
  const responsePath = resolve(f.base, 'api-response.json');
  // Vercel 56.3.2 inspect --format=json is a display projection with no meta.
  // The authenticated GET returns the actual metadata-bearing deployment.
  writeFileSync(
    cli,
    `#!${process.execPath}
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.writeFileSync(${JSON.stringify(argvPath)}, JSON.stringify(args));
const deployment = JSON.parse(fs.readFileSync(${JSON.stringify(responsePath)}, 'utf8'));
if (args[0] === 'inspect') delete deployment.meta;
else if (JSON.stringify(args) !== JSON.stringify(['api', '/v13/deployments/dpl_fixture123', '--method', 'GET', '--raw', '--scope', 'fixture-team'])) process.exit(2);
process.stdout.write(JSON.stringify(deployment));
`
  );
  chmodSync(cli, 0o755);
  f.captureInputs();
  f.makeOutput();
  const receipt = captureArtifact(f.root, f.sha, f.input, f.artifact, f.sbom);
  const deployment = f.ready(receipt);
  writeFileSync(responsePath, JSON.stringify(deployment));
  const inspected = JSON.parse(
    execFileSync(
      'bash',
      [
        '-c',
        `
set -euo pipefail
production_deploy_id=dpl_fixture123
scope_args=(--scope fixture-team)
fail_stage() { exit 1; }
${readDeployment}
printf '%s' "$production_deploy_json"
`,
      ],
      { cwd: f.root, encoding: 'utf8' }
    )
  );
  const bound = bindDeployment(f.root, f.sha, f.artifact, inspected, f.bound);
  assert.equal(bound.deployment.id, deployment.id);
  assert.equal(bound.artifactReceiptDigest, receipt.digest);
  assert.deepEqual(JSON.parse(readFileSync(argvPath, 'utf8')), [
    'api',
    '/v13/deployments/dpl_fixture123',
    '--method',
    'GET',
    '--raw',
    '--scope',
    'fixture-team',
  ]);
  for (const meta of [
    undefined,
    { ...deployment.meta, jovieInputReceipt: '0'.repeat(64) },
  ]) {
    assert.throws(
      () =>
        bindDeployment(
          f.root,
          f.sha,
          f.artifact,
          { ...inspected, meta },
          f.bound
        ),
      /Deployment provenance mismatch/
    );
  }
});

function fixture(t) {
  const base = mkdtempSync(resolve(tmpdir(), 'jovie-input-proof-'));
  const root = resolve(base, 'repo');
  mkdirSync(root);
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const git = (...args) =>
    execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  git('init', '-q');
  git('config', 'user.email', 'test@example.invalid');
  git('config', 'user.name', 'Fixture');
  writeFileSync(resolve(root, 'page.tsx'), 'canonical page\n');
  writeFileSync(resolve(root, '.gitignore'), '.vercel/\n.env.local\n');
  mkdirSync(resolve(root, 'apps/web'), { recursive: true });
  for (const [path, contents] of [
    ['pnpm-lock.yaml', "lockfileVersion: '9.0'\n"],
    ['pnpm-workspace.yaml', "packages:\n  - 'apps/*'\n"],
    ['package.json', '{"name":"fixture","packageManager":"pnpm@9.15.9"}\n'],
    ['.npmrc', 'engine-strict=false\n'],
    ['.nvmrc', '22.23.2\n'],
    ['apps/web/package.json', '{"name":"@jovie/web"}\n'],
    ['apps/web/next.config.js', 'export default {}\n'],
    ['apps/web/vercel.json', '{}\n'],
  ])
    writeFileSync(resolve(root, path), contents);
  git('add', '.');
  git('-c', 'core.hooksPath=/dev/null', 'commit', '-qm', 'fixture');
  const sha = git('rev-parse', 'HEAD');
  const input = resolve(base, 'inputs.json'),
    artifact = resolve(base, 'artifact.json'),
    bound = resolve(base, 'deployment.json'),
    sbom = resolve(base, 'sbom.cdx.json');
  writeFileSync(
    sbom,
    JSON.stringify(
      buildSbom(
        {
          MIT: [
            { name: '@fixture/runtime', versions: ['1.2.3'], license: 'MIT' },
          ],
        },
        sha
      )
    )
  );
  const capture = (expectedSha = sha) =>
    captureInputs(root, expectedSha, input, sbom, {
      os: 'Linux',
      arch: 'X64',
      name: 'fixture-runner',
      environment: 'github-hosted',
      image: 'ubuntu24',
    });
  const makeOutput = () => {
    mkdirSync(resolve(root, '.vercel/output'), { recursive: true });
    writeFileSync(resolve(root, '.vercel/output/config.json'), '{"version":3}');
  };
  const ready = receipt => ({
    id: 'dpl_fixture123',
    url: 'fixture.vercel.app',
    target: 'production',
    readyState: 'READY',
    meta: {
      githubCommitSha: sha,
      jovieInputReceipt: receipt.digest,
      jovieArtifactDigest: receipt.artifact.digest,
      gitDirty: '1',
    },
  });
  return {
    root,
    sha,
    base,
    input,
    artifact,
    bound,
    sbom,
    git,
    makeOutput,
    ready,
    captureInputs: capture,
  };
}

test('records clean baseline, dirty paths and artifact/deployment binding without leaking file bodies', t => {
  const f = fixture(t);
  writeFileSync(resolve(f.root, '.env.local'), 'SECRET_VALUE_NEVER_PUBLISH');
  const before = f.captureInputs();
  assert.equal(before.source.gitDirty, false);
  writeFileSync(resolve(f.root, 'page.tsx'), 'changed during build');
  writeFileSync(resolve(f.root, 'generated file\nname.ts'), 'generated output');
  f.makeOutput();
  const artifact = captureArtifact(f.root, f.sha, f.input, f.artifact, f.sbom);
  assert.deepEqual(
    artifact.changesDuringBuild.map(x => x.classification),
    ['added-during-build', 'changed-during-build']
  );
  assert.deepEqual(artifact.source.changes.map(x => x.classification).sort(), [
    'tracked-delta',
    'untracked',
  ]);
  const bound = bindDeployment(
    f.root,
    f.sha,
    f.artifact,
    f.ready(artifact),
    f.bound
  );
  assert.equal(bound.deployment.gitDirty, '1');
  assert.equal(bound.contract, 'jovie.certification/v1');
  assert.equal(bound.artifactReceiptDigest, artifact.digest);
  assert.equal(bound.inputReceiptDigest, before.digest);
  assert.match(bound.qualification, /inspect deltas/);
  for (const file of [f.input, f.artifact, f.bound]) {
    assert.ok(
      !readFileSync(file, 'utf8').includes('SECRET_VALUE_NEVER_PUBLISH')
    );
    assert.ok(!readFileSync(file, 'utf8').includes('changed during build'));
  }
});

test('captures preexisting untracked inputs, deleted tracked paths, staged edits, and source symlinks', t => {
  const f = fixture(t);
  rmSync(resolve(f.root, 'page.tsx'));
  writeFileSync(resolve(f.root, 'new.ts'), 'before build');
  f.git('add', 'new.ts');
  symlinkSync('new.ts', resolve(f.root, 'link.ts'));
  const snapshot = sourceSnapshot(f.root, f.sha);
  assert.equal(snapshot.files.find(x => x.path === 'page.tsx').kind, 'missing');
  assert.equal(snapshot.files.find(x => x.path === 'link.ts').target, 'new.ts');
  assert.equal(snapshot.changes.find(x => x.path === 'new.ts').index, 'A');
  assert.equal(
    snapshot.changes.find(x => x.path === 'link.ts').classification,
    'untracked'
  );
  const next = structuredClone(snapshot);
  next.files = next.files.filter(x => x.path !== 'link.ts');
  assert.equal(
    compareSources(snapshot, next)[0].classification,
    'removed-during-build'
  );
  assert.deepEqual(compareSources(snapshot, snapshot), []);
});

test('rejects wrong checkout SHA before recording inputs', t => {
  const f = fixture(t);
  assert.throws(() => f.captureInputs('a'.repeat(40)), /Checkout SHA/);
  assert.throws(() => sourceSnapshot(f.root, 'not-a-sha'), /Invalid expected/);
});

test('binds traced symlink target bytes and refuses escaped/cyclic artifact links', t => {
  const f = fixture(t);
  f.makeOutput();
  symlinkSync('../../page.tsx', resolve(f.root, '.vercel/output/page-link'));
  const first = artifactSnapshot(f.root);
  assert.ok(first.files.some(x => x.path.endsWith('/@resolved') && x.sha256));
  writeFileSync(resolve(f.root, 'page.tsx'), 'new linked bytes');
  assert.notEqual(artifactSnapshot(f.root).digest, first.digest);
  symlinkSync(f.base, resolve(f.root, '.vercel/output/escape'));
  assert.throws(() => artifactSnapshot(f.root), /escapes checkout/);
  rmSync(resolve(f.root, '.vercel/output/escape'));
  symlinkSync('.', resolve(f.root, '.vercel/output/cycle'));
  assert.throws(() => artifactSnapshot(f.root), /cycle/);
});

test('rejects tampered input receipts and missing build outputs', t => {
  const f = fixture(t);
  f.captureInputs();
  assert.throws(
    () => captureArtifact(f.root, f.sha, f.input, f.artifact, f.sbom),
    /ENOENT|Missing/
  );
  const input = JSON.parse(readFileSync(f.input));
  input.source.head = 'a'.repeat(40);
  writeFileSync(f.input, JSON.stringify(input));
  f.makeOutput();
  assert.throws(
    () => captureArtifact(f.root, f.sha, f.input, f.artifact, f.sbom),
    /Receipt digest/
  );
});

for (const target of ['pnpm-lock.yaml', 'sbom.cdx.json'])
  test(`rejects dependency evidence tampering: ${target}`, t => {
    const f = fixture(t);
    f.captureInputs();
    f.makeOutput();
    const path = target === 'sbom.cdx.json' ? f.sbom : resolve(f.root, target);
    writeFileSync(path, 'tampered\n');
    assert.throws(
      () => captureArtifact(f.root, f.sha, f.input, f.artifact, f.sbom),
      /Supply-chain build inputs changed|Production SBOM changed/
    );
  });

test('builds a deterministic CycloneDX production dependency inventory', () => {
  const sha = 'a'.repeat(40);
  const sbom = buildSbom(
    {
      MIT: [
        { name: 'plain', versions: ['2.0.0'], license: 'MIT' },
        { name: '@scope/pkg', versions: ['1.0.0'], license: 'Apache-2.0' },
      ],
    },
    sha
  );
  assert.equal(sbom.bomFormat, 'CycloneDX');
  assert.equal(sbom.specVersion, '1.6');
  assert.deepEqual(
    sbom.components.map(component => component.purl),
    ['pkg:npm/%40scope/pkg@1.0.0', 'pkg:npm/plain@2.0.0']
  );
  assert.equal(sbom.metadata.component['bom-ref'], `git:${sha}`);
  assert.ok(
    sbom.metadata.properties.some(
      property =>
        property.name === 'jovie:certification-contract' &&
        property.value === 'jovie.certification/v1'
    )
  );
});

test('accepts the workflow normalized inspect shapes and rejects non-origin URLs', t => {
  const f = fixture(t);
  f.captureInputs();
  f.makeOutput();
  const receipt = captureArtifact(f.root, f.sha, f.input, f.artifact, f.sbom);
  for (const alias of ['state', 'status']) {
    const deployment = f.ready(receipt);
    delete deployment.readyState;
    deployment[alias] = 'ready';
    deployment.target = 'PRODUCTION';
    deployment.url = 'https://fixture.vercel.app/';
    const bound = bindDeployment(
      f.root,
      f.sha,
      f.artifact,
      deployment,
      resolve(f.base, alias + '.json')
    );
    assert.equal(bound.deployment.readyState, 'READY');
    assert.equal(bound.deployment.url, 'https://fixture.vercel.app');
  }
  for (const url of [
    'http://fixture.vercel.app',
    'https://fixture.vercel.app/path',
    'https://user@fixture.vercel.app',
    'https://fixture.vercel.app:443',
  ]) {
    assert.throws(
      () =>
        bindDeployment(
          f.root,
          f.sha,
          f.artifact,
          { ...f.ready(receipt), url },
          f.bound
        ),
      /Invalid deployment URL/
    );
  }
});

test('executes the workflow CLI phases with stdin metadata and preserves prior receipts', t => {
  const f = fixture(t);
  const script = fileURLToPath(
    new URL('./production-input-provenance.mjs', import.meta.url)
  );
  const run = (args, input) =>
    execFileSync(process.execPath, [script, ...args], {
      cwd: f.root,
      env: { ...process.env, EXPECTED_SHA: f.sha },
      input,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  run(['inputs', f.input, f.sbom]);
  f.makeOutput();
  const digests = run(['artifact', f.artifact, f.input, f.sbom])
    .trim()
    .split(' ');
  const receipt = JSON.parse(readFileSync(f.artifact));
  assert.deepEqual(digests, [receipt.digest, receipt.artifact.digest]);
  run(['bind', f.bound, f.artifact], JSON.stringify(f.ready(receipt)));
  assert.equal(
    JSON.parse(readFileSync(f.bound)).deployment.id,
    'dpl_fixture123'
  );
  assert.throws(() => run(['inputs', f.input, f.sbom]), /EEXIST/);
  assert.throws(() => run(['unknown', f.input]), /Expected sbom/);
});

for (const [field, value] of [
  ['id', 'other'],
  ['url', 'evil.example'],
  ['readyState', 'BUILDING'],
  ['target', 'preview'],
  ['meta.githubCommitSha', 'a'.repeat(40)],
  ['meta.jovieInputReceipt', 'b'.repeat(64)],
  ['meta.jovieArtifactDigest', 'c'.repeat(64)],
])
  test('rejects mismatched deployment ' + field, t => {
    const f = fixture(t);
    f.captureInputs();
    f.makeOutput();
    const receipt = captureArtifact(f.root, f.sha, f.input, f.artifact, f.sbom);
    const deployment = f.ready(receipt);
    if (field.startsWith('meta.')) deployment.meta[field.slice(5)] = value;
    else deployment[field] = value;
    assert.throws(
      () => bindDeployment(f.root, f.sha, f.artifact, deployment, f.bound),
      /Deployment|deployment/
    );
  });

for (const changed of ['page.tsx', '.vercel/output/config.json'])
  test('rejects post-capture drift: ' + changed, t => {
    const f = fixture(t);
    f.captureInputs();
    f.makeOutput();
    const receipt = captureArtifact(f.root, f.sha, f.input, f.artifact, f.sbom);
    writeFileSync(resolve(f.root, changed), 'drift');
    assert.throws(
      () =>
        bindDeployment(f.root, f.sha, f.artifact, f.ready(receipt), f.bound),
      /changed after/
    );
  });

test('workflow records inputs before build and binds inspected deployment before canary/promotion', () => {
  const workflow = readFileSync(
    new URL('../workflows/production-release.yml', import.meta.url),
    'utf8'
  );
  const job = workflow.slice(
    workflow.indexOf('  promote-production:'),
    workflow.indexOf('  staging-deployment-receipt:')
  );
  const order = [
    'production-input-provenance.mjs sbom',
    'production-input-provenance.mjs inputs',
    'vercel build --prod',
    'production-input-provenance.mjs artifact',
    '--meta "jovieInputReceipt=',
    'production-input-provenance.mjs bind',
    'bootstrap-cookie-jar',
  ];
  let previous = -1;
  for (const text of order) {
    const at = job.indexOf(text);
    assert.ok(at > previous, text);
    previous = at;
  }
  assert.match(
    job,
    /if ! node \.github\/scripts\/production-input-provenance\.mjs bind/
  );
  assert.match(
    job,
    /path: \$\{\{ runner.temp \}\}\/production-input-provenance\/\*\.json/
  );
  assert.match(job, /if-no-files-found: error/);
  assert.ok(!job.includes('production-input-provenance/**'));
});
