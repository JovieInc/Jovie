import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { buildEnvHash } from '../../ci/web-build-env-hash.mjs';
import { evaluateIf, loadWorkflowYaml } from '../queue-parity.mjs';

const root = resolve(import.meta.dirname, '../../..');
const read = file => readFileSync(resolve(root, file), 'utf8');
const workflow = loadWorkflowYaml(read('.github/workflows/ci.yml'));

test('loadWorkflowYaml returns a mapping and rejects other documents', () => {
  const doc = loadWorkflowYaml('jobs:\n  build:\n    steps: []\n');
  assert.deepEqual(Object.keys(doc.jobs ?? {}), ['build']);
  assert.throws(() => loadWorkflowYaml('- item\n'), /not a mapping/);
  assert.throws(() => loadWorkflowYaml('plain\n'), /not a mapping/);
});
const jobs = workflow.jobs;
const step = (id, name) => {
  const found = jobs[id].steps.find(s => s.name === name);
  assert.ok(found, `${id}: ${name}`);
  return found;
};
const hash = env =>
  buildEnvHash(env, { lockfile: read('pnpm-lock.yaml'), nodeMajor: '24' });
const builds = s =>
  /pnpm (?:turbo build --filter=@jovie\/web|--filter[= ]@jovie\/web (?:run )?build)/.test(
    s.run || ''
  );
// Separate by design, not exemptions from the pairwise uniqueness check.
// No profile/job name is salted into the hash. Expressions below are declared
// inputs, not a claim that unknown secret values have been resolved locally.
const separate = {
  'ci-build-layout': 'Mock auth at origin port 3230',
  'ci-visual-snapshot-compare': 'Toolbar disabled and synthetic prerender auth',
  'ci-blog-content': 'Origin port 3100; exclusive with MQ Build + Layout',
  'ci-lighthouse-dashboard-pr':
    'No mock/origin flags or database yet; head must match the BASE build',
  'ci-lighthouse-onboarding-pr':
    'No mock/origin flags; database exported BEFORE compilation',
};
const declaredEnv = (job, index) => {
  const inherited = {};
  for (const s of job.steps.slice(0, index)) {
    if (evaluateIf(s.if, 'merge_group') === false) continue;
    // Include preceding GITHUB_ENV exports, not later test/server env. Where
    // branches select a DB, preserve the declared sources without reading or
    // logging credentials. Same sources produce the same declaration hash.
    for (const [, key, value] of (s.run || '').matchAll(
      /echo "([A-Z_][A-Z0-9_]*)=(.*?)" >> "\$GITHUB_ENV"/g
    )) {
      inherited[key] ??= new Set();
      inherited[key].add(value);
    }
  }
  return {
    CI: 'true',
    GITHUB_ACTIONS: 'true',
    ...workflow.env,
    ...job.env,
    ...Object.fromEntries(
      Object.entries(inherited).map(([key, values]) => [
        key,
        values.size === 1 ? [...values][0] : JSON.stringify([...values].sort()),
      ])
    ),
    ...job.steps[index].env,
  };
};
const mqBuildSites = () =>
  Object.entries(jobs).flatMap(([id, job]) => {
    if (evaluateIf(job.if, 'merge_group') === false) return [];
    return (job.steps || []).flatMap((s, index) =>
      builds(s) && evaluateIf(s.if, 'merge_group') !== false
        ? [{ id, name: s.name, env: declaredEnv(job, index) }]
        : []
    );
  });
const distinctBuildHashes = sites => {
  const byHash = new Map();
  for (const site of sites) {
    const envHash = hash(site.env);
    assert.ok(
      !byHash.has(envHash),
      `duplicate MQ build env: ${byHash.get(envHash)} and ${site.id}/${site.name}; replace the duplicate build with verified artifact reuse`
    );
    byHash.set(envHash, `${site.id}/${site.name}`);
  }
};

test('every MQ exact-head build has distinct declared inputs and a separate-by-design reason', () => {
  const sites = mqBuildSites();
  assert.deepEqual(sites.map(s => s.id).sort(), Object.keys(separate).sort());
  distinctBuildHashes(sites);
  for (const { env } of sites)
    for (const key of Object.keys(env)) {
      if (/^(TURBO_|CF_TURBO_|PLAYWRIGHT_)/.test(key)) continue;
      assert.notEqual(
        hash({}),
        hash({ [key]: env[key] || 'changed' }),
        `unhashed build input: ${key}`
      );
    }
  assert.match(jobs['ci-blog-content'].if, /blog_content_only == 'true'/);
  assert.match(jobs['ci-build-layout'].if, /blog_content_only != 'true'/);
});

test('deliberate red: equal MQ build hashes fail, even with a separate-build reason', () => {
  const sites = mqBuildSites();
  assert.throws(
    () =>
      distinctBuildHashes([
        ...sites,
        { ...sites[0], id: 'future-duplicate', reason: 'separate by design' },
      ]),
    /duplicate MQ build env/
  );
  // Ignoring earlier DB exports reproduces the old false equivalence. Prove
  // the all-pairs check catches dashboard/onboarding, not just layout drift.
  const withoutDatabase = sites.map(s => ({ ...s, env: { ...s.env } }));
  for (const s of withoutDatabase) delete s.env.DATABASE_URL;
  assert.throws(
    () => distinctBuildHashes(withoutDatabase),
    /ci-lighthouse-dashboard-pr.*ci-lighthouse-onboarding-pr/
  );
});

test('manifest env equals actual build env; every visual/public extraction verifies before use', () => {
  const profiles = Object.fromEntries(
    [
      [
        'visual',
        'ci-visual-snapshot-compare',
        'Build homepage for rendered snapshot compare',
      ],
      [
        'public',
        'ci-build-public',
        'Build app (public routes only — no secrets needed)',
      ],
    ].map(([profile, id, name]) => [
      profile,
      declaredEnv(jobs[id], jobs[id].steps.indexOf(step(id, name))),
    ])
  );
  // Any future declared build input outside the supported prefixes must be
  // added to the hasher, rather than silently falling outside the contract.
  for (const env of Object.values(profiles))
    for (const key of Object.keys(env)) {
      if (/^(TURBO_|CF_TURBO_|PLAYWRIGHT_)/.test(key)) continue;
      assert.notEqual(
        hash({}),
        hash({ [key]: env[key] || 'changed' }),
        `unhashed build input: ${key}`
      );
    }
  let consumers = 0;
  for (const [id, job] of Object.entries(jobs)) {
    const ss = job.steps || [];
    for (let i = 0; i < ss.length; i++) {
      const s = ss[i];
      const command =
        /web-build-env-hash.mjs (write|verify) (visual|public)/.exec(
          s.run || ''
        );
      if (command) {
        assert.equal(s['continue-on-error'], undefined);
        assert.equal(
          hash(declaredEnv(job, i)),
          hash(profiles[command[2]]),
          `${id}: profile drift`
        );
      }
      if (
        !/tar -xf .*\/(?:visual-compare-build|nextjs-build)\.tar/.test(
          s.run || ''
        )
      )
        continue;
      // Producer's standalone smoke extracts to a separate temp root, not the
      // consumer app tree. All inter-job extractions are guarded here.
      if (!s.run.includes('-C apps/web')) continue;
      consumers++;
      const inline = s.run.indexOf('web-build-env-hash.mjs verify public');
      if (inline >= 0) {
        assert.ok(inline > s.run.indexOf('tar -xf'));
        assert.ok(inline < s.run.indexOf('else'));
        assert.match(s.run, /if \[ -d /);
      } else {
        const verify = ss[i + 1];
        assert.match(verify?.run || '', /web-build-env-hash.mjs verify/);
        assert.equal(verify.if, s.if);
        assert.equal(verify['continue-on-error'], undefined);
      }
      assert.equal(s['continue-on-error'], undefined);
    }
  }
  assert.equal(consumers, 14);
  for (const [profile, id] of [
    ['visual', 'ci-visual-snapshot-compare'],
    ['public', 'ci-build-public'],
  ]) {
    const ss = jobs[id].steps;
    const write = ss.findIndex(s =>
      s.run?.includes(`web-build-env-hash.mjs write ${profile}`)
    );
    const tar = ss.findIndex(s => s.run?.includes('tar -cf '));
    assert.ok(write >= 0 && write < tar);
    assert.match(ss[tar].run, /--exclude='\.next\/cache'/);
  }
});

test('artifact identity includes run attempt and optional downloads cannot swallow failures', () => {
  for (const job of Object.values(jobs))
    for (const s of job.steps || []) {
      if (!/^(visual-compare-build|nextjs-build)-/.test(s.with?.name || ''))
        continue;
      assert.ok(s.with.name.includes('${{ github.run_id }}'));
      assert.ok(s.with.name.includes('${{ github.run_attempt }}'));
      if (/download/.test(s.uses || ''))
        assert.equal(s['continue-on-error'], undefined);
    }
  const optional = loadWorkflowYaml(
    read('.github/actions/download-optional-web-build/action.yml')
  );
  const download = optional.runs.steps.find(s =>
    /actions\/download-artifact@/.test(s.uses || '')
  );
  assert.equal(download.with.pattern, '${{ inputs.name }}');
  assert.equal(download['continue-on-error'], undefined);
  assert.equal(download.with['merge-multiple'], true);
  assert.match(optional.runs.steps[0].run, /test ! -e/);
  assert.match(optional.runs.steps.at(-1).run, /if \[ -d/);
  assert.match(optional.runs.steps.at(-1).run, /::warning::/);
});

test('informational job tolerance stops at job level; failed verification stops tests', () => {
  for (const [id, testName] of [
    ['ci-a11y-authed', 'Run authenticated a11y specs'],
    ['ci-lighthouse-chat-pr', 'Run authenticated chat Lighthouse'],
  ]) {
    const job = jobs[id];
    assert.equal(job['continue-on-error'], true);
    const verify = job.steps.findIndex(s =>
      s.run?.includes('web-build-env-hash.mjs verify public')
    );
    const use = job.steps.findIndex(s => s.name === testName);
    assert.ok(verify >= 0 && use > verify);
    assert.equal(job.steps[verify]['continue-on-error'], undefined);
    // An ordinary step if has implicit success(); job-level tolerance cannot
    // resume steps after failure. Failure evidence may still upload normally.
    assert.doesNotMatch(job.steps[use].if || '', /always\(|failure\(/);
  }
});
