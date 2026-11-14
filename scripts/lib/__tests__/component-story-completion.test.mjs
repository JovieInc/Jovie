import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { storyReceipt } from '../component-evidence.mjs';
import { snapshotRenderInputs } from '../component-render-inputs.mjs';
import {
  requireCurrentStoryCache,
  verifiedStoryCacheKey,
} from '../component-story-completion.mjs';

const { load } = createRequire(import.meta.url)('js-yaml');
const root = resolve(import.meta.dirname, '../../..');
const certificate = load(
  readFileSync(
    join(root, '.github/workflows/component-certificate.yml'),
    'utf8'
  )
);
const job = certificate.jobs.certify;
const steps = job.steps;
const admission = certificate.jobs.failed_capture;
const fixtureRoots = [];
afterEach(() => {
  for (const root of fixtureRoots.splice(0))
    rmSync(root, { recursive: true, force: true });
});
const allowed = (condition, github, result = 'skipped', cancelled = false) =>
  Function(
    'github',
    'contains',
    'fromJSON',
    'needs',
    'cancelled',
    `return (${condition});`
  )(
    github,
    (values, value) => values.includes(value),
    JSON.parse,
    { failed_capture: { result } },
    () => cancelled
  );

function failedCapture() {
  const repository = { id: 42, full_name: 'JovieInc/Jovie' };
  const run = {
    id: 43580738007,
    run_attempt: 1,
    workflow_id: 123,
    name: 'Visual & A11y Tests',
    path: '.github/workflows/visual-a11y.yml',
    status: 'completed',
    conclusion: 'failure',
    event: 'push',
    head_branch: 'main',
    head_sha: 'b'.repeat(40),
    repository: { ...repository },
    head_repository: { ...repository },
  };
  const context = {
    repository: repository.full_name,
    ref: 'refs/heads/main',
    eventName: 'workflow_run',
    event: { repository, workflow_run: run },
  };
  const child = {
    id: 132407555786,
    run_id: run.id,
    run_attempt: run.run_attempt,
    head_sha: run.head_sha,
    head_branch: 'main',
    name: 'Component Story Evidence',
    status: 'completed',
    conclusion: 'success',
  };
  const jobs = [
    child,
    {
      ...child,
      id: child.id + 1,
      name: 'Storybook A11y Checks (11/16)',
      conclusion: 'failure',
    },
  ];
  const github = { ...context, event_name: context.eventName };
  return { context, run, child, jobs, github };
}

describe('failed visual workflow notification protocol', () => {
  it('accepts the projected real exact-attempt REST payload, including branch and attempt fields', async () => {
    // Raw response retained with SHA256 4f63ad363a7157c6c346bd73abdea3ec47869adc44747ecbc2414df10192379b.
    const listing = JSON.parse(
      readFileSync(
        join(
          import.meta.dirname,
          'fixtures/component-story-completion-jobs.json'
        ),
        'utf8'
      )
    );
    const child = listing.jobs.find(
      job => job.name === 'Component Story Evidence'
    );
    expect(child).toMatchObject({
      head_branch: 'main',
      run_attempt: 1,
      status: 'completed',
      conclusion: 'success',
    });
    expect(
      listing.jobs.find(job => job.name === 'Storybook A11y Checks (11/16)')
        .conclusion
    ).toBe('failure');
    const f = failedCapture();
    Object.assign(f.run, {
      id: child.run_id,
      run_attempt: child.run_attempt,
      head_sha: child.head_sha,
      head_branch: child.head_branch,
    });
    expect(await verifiedStoryCacheKey(f.context, async () => listing)).toBe(
      'component-story-evidence-43580738007-1'
    );
  });
  it('admits an exact successful canonical child despite an independent failed a11y shard', async () => {
    const f = failedCapture();
    const routes = [];
    expect(
      await verifiedStoryCacheKey(f.context, async route => {
        routes.push(route);
        return { total_count: f.jobs.length, jobs: f.jobs };
      })
    ).toBe('component-story-evidence-43580738007-1');
    expect(routes).toEqual([
      'repos/JovieInc/Jovie/actions/runs/43580738007/attempts/1/jobs?per_page=100',
    ]);
    expect(allowed(job.if, f.github, 'success')).toBe(true);
    expect(allowed(admission.if, f.github)).toBe(true);
    // Unverified events must not enter the per-target cancellation group.
    for (const result of ['skipped', 'failure', 'cancelled'])
      expect(allowed(job.if, f.github, result)).toBe(false);
    expect(allowed(job.if, f.github, 'success', true)).toBe(false);
    expect(job.needs).toBe('failed_capture');
    expect(admission.concurrency).toBeUndefined();
    expect(admission.permissions).toEqual({ contents: 'read' });
    expect(job.permissions).toEqual({ contents: 'read' });
  });
  it.each([
    [
      'foreign repository',
      f => {
        f.run.head_repository.full_name = 'fork/Jovie';
      },
    ],
    [
      'foreign repository identity',
      f => {
        f.run.head_repository.id = 99;
      },
    ],
    [
      'untrusted event',
      f => {
        f.run.event = 'pull_request';
      },
    ],
    [
      'other workflow',
      f => {
        f.run.name = 'Mutation Diff';
      },
    ],
    [
      'wrong workflow path',
      f => {
        f.run.path = '.github/workflows/ci.yml';
      },
    ],
    [
      'non-main branch',
      f => {
        f.run.head_branch = 'feature';
      },
    ],
    [
      'other ref',
      f => {
        f.context.ref = 'refs/heads/feature';
      },
    ],
    [
      'cancelled run',
      f => {
        f.run.conclusion = 'cancelled';
      },
    ],
    [
      'invalid attempt',
      f => {
        f.run.run_attempt = 0;
      },
    ],
  ])('rejects %s before any API read', async (_name, mutate) => {
    const f = failedCapture();
    mutate(f);
    let reads = 0;
    await expect(
      verifiedStoryCacheKey(f.context, async () => {
        reads++;
      })
    ).rejects.toThrow('untrusted');
    expect(reads).toBe(0);
  });
  it.each(['missing', 'failure', 'skipped', 'running', 'ambiguous'])(
    'rejects a %s canonical child',
    async kind => {
      const f = failedCapture();
      if (kind === 'missing') f.jobs.shift();
      else if (kind === 'ambiguous') f.jobs.push({ ...f.child, id: 999 });
      else if (kind === 'running') f.child.status = 'in_progress';
      else f.child.conclusion = kind;
      await expect(
        verifiedStoryCacheKey(f.context, async () => ({
          total_count: f.jobs.length,
          jobs: f.jobs,
        }))
      ).rejects.toThrow('canonical story child');
    }
  );
  it.each([
    'run_id',
    'run_attempt',
    'head_sha',
    'head_branch',
    'id',
    'duplicate',
    'truncated',
  ])('rejects mismatched or incomplete job identity: %s', async field => {
    const f = failedCapture();
    const listing = { total_count: f.jobs.length, jobs: f.jobs };
    if (field === 'truncated') listing.total_count++;
    else if (field === 'duplicate') f.jobs[1].id = f.child.id;
    else f.child[field] = field.startsWith('head_') ? 'wrong' : 0;
    await expect(
      verifiedStoryCacheKey(f.context, async () => listing)
    ).rejects.toThrow('job listing');
  });
  it('does not admit missing, malformed, or denied API proof', async () => {
    for (const response of [null, {}, { total_count: 0, jobs: [] }])
      await expect(
        verifiedStoryCacheKey(failedCapture().context, async () => response)
      ).rejects.toThrow('job listing');
    await expect(
      verifiedStoryCacheKey(failedCapture().context, async () => {
        throw new Error('HTTP 403');
      })
    ).rejects.toThrow('HTTP 403');
  });
  it.each(['success', 'denied', 'deferred', 'malformed'])(
    'the real CLI publishes a cache key only for valid proof (%s)',
    kind => {
      const f = failedCapture();
      const directory = mkdtempSync(join(tmpdir(), 'story-completion-cli-'));
      fixtureRoots.push(directory);
      const response = JSON.stringify({
        total_count: f.jobs.length,
        jobs: f.jobs,
      });
      const binary = join(directory, 'gh');
      writeFileSync(
        binary,
        `#!${process.execPath}\nprocess.stdout.write(${JSON.stringify(kind === 'malformed' ? '{' : response)});\nprocess.stderr.write(${JSON.stringify(kind === 'denied' ? 'HTTP 403' : '')});\nprocess.exitCode=${kind === 'denied' ? 1 : kind === 'deferred' ? 75 : 0};\n`
      );
      chmodSync(binary, 0o755);
      const eventPath = join(directory, 'event.json');
      const outputPath = join(directory, 'outputs');
      writeFileSync(eventPath, JSON.stringify(f.context.event));
      const result = spawnSync(
        process.execPath,
        [join(root, 'scripts/lib/component-story-completion.mjs')],
        {
          env: {
            ...process.env,
            PATH: `${directory}${delimiter}${process.env.PATH}`,
            GH_TOKEN: 'fixture-only-token',
            JOVIE_API_STATE_DIR: join(directory, 'api-state'),
            GITHUB_REF: f.context.ref,
            GITHUB_REPOSITORY: f.context.repository,
            GITHUB_EVENT_NAME: f.context.eventName,
            GITHUB_EVENT_PATH: eventPath,
            GITHUB_OUTPUT: outputPath,
          },
          encoding: 'utf8',
          timeout: 10000,
        }
      );
      expect(result.status, result.stderr).toBe(
        kind === 'success' ? 0 : kind === 'deferred' ? 75 : 1
      );
      expect(existsSync(outputPath)).toBe(kind === 'success');
      if (kind === 'success')
        expect(readFileSync(outputPath, 'utf8')).toBe(
          'cache-key=component-story-evidence-43580738007-1\n'
        );
    }
  );
  it('requires exact cache admission and restore before certification work can continue', () => {
    const lookup = admission.steps.find(step => step.id === 'cache');
    const restored = steps.find(step => step.id === 'admitted_capture');
    expect(lookup.with).toMatchObject({
      'fail-on-cache-miss': true,
    });
    expect(restored.with['fail-on-cache-miss']).toBe(true);
    for (const restore of [lookup, restored]) {
      expect(restore.with['restore-keys']).toBeUndefined();
      expect(restore['continue-on-error']).toBeUndefined();
    }
    expect(lookup.with.key).toBe('${{ steps.canonical.outputs.cache-key }}');
    expect(restored.with.key).toBe(
      '${{ needs.failed_capture.outputs.cache-key }}'
    );
    expect(admission.steps.at(-1).name).toBe(
      'Require current capture bindings'
    );
    expect(admission.steps.at(-1).run).toContain('--require-current-cache');
    const gates = [
      admission.steps.find(
        step => step.name === 'Require exact capture cache admission'
      ),
      steps.find(step => step.name === 'Require exact restored capture'),
    ];
    for (const gate of gates)
      for (const [hit, matched, expected] of [
        ['true', 'component-story-evidence-43580738007-1', 0],
        ['', '', 1],
        ['false', 'component-story-evidence-43580738007-1-newer', 1],
        ['true', 'component-story-evidence-43580738007-2', 1],
      ]) {
        const root = mkdtempSync(join(tmpdir(), 'exact-story-cache-'));
        fixtureRoots.push(root);
        const result = spawnSync(
          'bash',
          ['-c', `${gate.run}\nprintf admitted > "$MARKER"`],
          {
            env: {
              ...process.env,
              EXPECTED_KEY: 'component-story-evidence-43580738007-1',
              MATCHED_KEY: String(matched),
              CACHE_HIT: String(hit),
              MARKER: join(root, 'marker'),
            },
            encoding: 'utf8',
          }
        );
        expect(result.status, result.stderr).toBe(expected);
        expect(existsSync(join(root, 'marker'))).toBe(expected === 0);
      }
  });
});

function cacheFixture(status = 'pass') {
  const base = mkdtempSync(join(tmpdir(), 'current-story-cache-'));
  fixtureRoots.push(base);
  const root = join(base, 'checkout');
  const cache = join(base, 'cache');
  mkdirSync(root);
  mkdirSync(cache);
  execFileSync('git', ['init', '-q'], {
    cwd: root,
    env: Object.fromEntries(
      Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_'))
    ),
  });
  const put = (path, bytes) => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), bytes);
  };
  const component = 'packages/ui/atoms/proof.tsx';
  put('package.json', '{}');
  put(component, 'export const Proof = () => null;');
  put('apps/web/app/globals.css', 'body { color: black; }');
  const record = {
    ...storyReceipt(
      createHash('sha256')
        .update(readFileSync(join(root, component)))
        .digest('hex'),
      ['proof--default'],
      snapshotRenderInputs(root).binding
    ),
    status,
    detail: status === 'fail' ? 'measured violation' : undefined,
  };
  for (const kind of ['visual', 'a11y'])
    writeFileSync(
      join(cache, `${kind}.json`),
      JSON.stringify({ components: { [component]: record } })
    );
  const change = mutate => {
    const path = join(cache, 'a11y.json');
    const data = JSON.parse(readFileSync(path, 'utf8'));
    mutate(data.components[component], data);
    writeFileSync(path, JSON.stringify(data));
  };
  return { root, cache, component, put, change };
}

describe('current capture bindings before refresh admission', () => {
  it.each(['pass', 'fail'])(
    'retains current %s observations across unrelated CI advancement',
    status => {
      const f = cacheFixture(status);
      f.put('.github/workflows/unrelated-ci.yml', 'name: unrelated CI change');
      expect(() => requireCurrentStoryCache(f.root, f.cache)).not.toThrow();
      expect(
        JSON.parse(readFileSync(join(f.cache, 'a11y.json'), 'utf8')).components[
          f.component
        ].status
      ).toBe(status);
      f.put('apps/web/app/globals.css', 'body { color: red; }');
      expect(() => requireCurrentStoryCache(f.root, f.cache)).toThrow(
        'binding'
      );
    }
  );
  it.each([
    [
      'source drift',
      f => f.put(f.component, 'export const Proof = () => false;'),
    ],
    [
      'wrong source hash',
      f =>
        f.change(record => {
          record.sourceHash = '0'.repeat(64);
        }),
    ],
    [
      'wrong profile digest',
      f =>
        f.change(record => {
          record.renderInputs.digest = '0'.repeat(64);
        }),
    ],
    [
      'wrong mode',
      f =>
        f.change(record => {
          record.renderInputs.mode = 'storybook-live-cert';
        }),
    ],
    [
      'invalid negative schema',
      f =>
        f.change(record => {
          record.status = 'fail';
          record.schema = 'unsupported';
        }),
    ],
    [
      'partial passing themes',
      f =>
        f.change(record => {
          record.stories[0].themes = ['light'];
        }),
    ],
    [
      'missing records',
      f =>
        f.change((_record, data) => {
          data.components = {};
        }),
    ],
    ['missing file', f => rmSync(join(f.cache, 'a11y.json'))],
    ['corrupt JSON', f => writeFileSync(join(f.cache, 'a11y.json'), '{')],
  ])('refuses %s before entering certificate concurrency', (_name, mutate) => {
    const f = cacheFixture();
    mutate(f);
    expect(() => requireCurrentStoryCache(f.root, f.cache)).toThrow();
  });
});
