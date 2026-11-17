import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { recordEvidenceAttempt } from '../../../scripts/lib/mutation-sweep-attempt.mjs';

const CLI = fileURLToPath(
  new URL('../mutation-next-target-cli.mjs', import.meta.url)
);
const FILE = 'packages/ui/atoms/form.tsx';
const BASE = 'repos/JovieInc/Jovie';
const SHA = 'a'.repeat(40);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const read = path => JSON.parse(readFileSync(path, 'utf8'));
const write = (path, value) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value)}\n`);
};
function command(binary, args, cwd) {
  const result = spawnSync(binary, args, {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_DATE: '2026-11-16T14:00:00Z',
      GIT_COMMITTER_DATE: '2026-11-16T14:00:00Z',
    },
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}
function fixture() {
  const cwd = mkdtempSync(join(tmpdir(), 'mutation-next-cli-'));
  const stateDir = join(cwd, '.cache/jovie-mutation');
  const runner = join(cwd, 'runner');
  const routes = {};
  const routesPath = join(cwd, 'routes.json');
  const callsPath = join(cwd, 'calls.jsonl');
  const output = join(cwd, 'output');
  mkdirSync(join(cwd, 'bin'), { recursive: true });
  for (const binary of ['git', 'python3']) {
    symlinkSync(command('which', [binary], cwd), join(cwd, 'bin', binary));
  }
  const request = {
    requestId: 'jov-12636-form-next',
    file: FILE,
    maxFiles: 1,
    predecessor: {
      runId: '400',
      runAttempt: '1',
      sha: SHA,
      cacheKey: 'mutation-sweep-portable-v2-400-1',
      artifactName: 'mutation-sweep-400',
    },
  };
  write(join(cwd, '.github/mutation-next-targets.json'), {
    schema: 'jovie.mutation-next-targets/v1',
    requests: [request],
  });
  mkdirSync(dirname(join(cwd, FILE)), { recursive: true });
  writeFileSync(join(cwd, FILE), 'export const fixture = "Form → receipt";\n');
  command('git', ['init', '-b', 'main', '--quiet'], cwd);
  command('git', ['add', '.github/mutation-next-targets.json', FILE], cwd);
  command(
    'git',
    [
      '-c',
      'user.name=Fixture',
      '-c',
      'user.email=fixture@example.invalid',
      'commit',
      '--quiet',
      '-m',
      'Fixture',
    ],
    cwd
  );
  const testedSha = command('git', ['rev-parse', 'HEAD'], cwd);
  const state = {
    schemaVersion: 1,
    modules: {},
    sweepSequences: { 'packages/ui': 4 },
    receiptProbe: 'Preserve UTF-8 bytes → exact ZIP digest',
  };
  write(join(stateDir, 'sweep-state.json'), state);
  const set = (path, json) => {
    routes[path] = { json };
  };
  let artifactId = 1000;
  function artifact(name, runId, sha, files) {
    const id = artifactId++;
    const zip = join(cwd, `${id}.zip`);
    const members = join(cwd, `${id}.json`);
    write(members, files);
    command(
      'python3',
      [
        '-c',
        'import json,sys,zipfile\nwith zipfile.ZipFile(sys.argv[2],"w") as z:\n for n,v in json.load(open(sys.argv[1])).items():z.writestr(zipfile.ZipInfo(n,(2026,1,1,0,0,0)),v.encode())',
        members,
        zip,
      ],
      cwd
    );
    const metadata = {
      id,
      name,
      expired: false,
      digest: `sha256:${hash(readFileSync(zip))}`,
      workflow_run: { id: Number(runId), head_sha: sha },
    };
    routes[`${BASE}/actions/artifacts/${id}/zip`] = { binary: zip };
    return metadata;
  }
  function listing(name, entries) {
    set(
      `${BASE}/actions/artifacts?name=${encodeURIComponent(name)}&per_page=100`,
      {
        total_count: entries.length,
        artifacts: entries,
      }
    );
  }
  function publication(pred, savedState, history = '', measurement = null) {
    const run = {
      id: Number(pred.runId),
      run_attempt: Number(pred.runAttempt),
      head_sha: pred.sha,
      head_branch: 'main',
      head_repository: { full_name: 'JovieInc/Jovie' },
      repository: { full_name: 'JovieInc/Jovie' },
      path: '.github/workflows/mutation-diff.yml',
      status: 'completed',
      conclusion: 'success',
      event: 'workflow_dispatch',
    };
    const steps = [
      'Score the next modules',
      'Snapshot sweep state and survivor tasks',
      'Save sweep state',
      'Upload sweep state and survivor tasks',
    ].map(name => ({
      name,
      status: 'completed',
      conclusion: 'success',
    }));
    set(`${BASE}/actions/runs/${run.id}`, run);
    set(`${BASE}/actions/runs/${run.id}/attempts/${run.run_attempt}`, run);
    set(
      `${BASE}/actions/runs/${run.id}/attempts/${run.run_attempt}/jobs?per_page=100`,
      {
        total_count: 1,
        jobs: [
          {
            id: run.id + 100,
            run_id: run.id,
            run_attempt: run.run_attempt,
            head_sha: pred.sha,
            status: 'completed',
            name: 'Rolling mutation sweep',
            steps,
          },
        ],
      }
    );
    const stateText = `${JSON.stringify(savedState)}\n`;
    const receipt = {
      schema: 'jovie.mutation-producer-receipt/v1',
      sha: pred.sha,
      runId: pred.runId,
      runAttempt: pred.runAttempt,
      cacheKey: pred.cacheKey,
      runtime: { node: '24.22.3' },
      scope: { kind: 'ui', include: FILE, maxFiles: 1 },
      stateSha256: hash(stateText),
      attemptsSha256: hash(history),
    };
    const files = {
      'producer-receipt.json': JSON.stringify(receipt),
      'sweep-state.json': stateText,
      'sweep-state.json.runs.jsonl': history,
    };
    if (measurement)
      files['next-target-result.json'] = JSON.stringify(measurement);
    const meta = artifact(pred.artifactName, pred.runId, pred.sha, files);
    set(`${BASE}/actions/runs/${run.id}/artifacts?per_page=100`, {
      total_count: 1,
      artifacts: [meta],
    });
    set(
      `${BASE}/actions/caches?key=${encodeURIComponent(pred.cacheKey)}&ref=refs%2Fheads%2Fmain&per_page=100`,
      {
        total_count: 1,
        actions_caches: [{ key: pred.cacheKey, ref: 'refs/heads/main' }],
      }
    );
    return meta;
  }
  listing(`mutation-next-claim-${request.requestId}`, []);
  const predecessorArtifact = publication(request.predecessor, state);
  let invocation = 0;
  function run(mode, extra = {}) {
    write(routesPath, routes);
    writeFileSync(output, '');
    const result = spawnSync(
      process.execPath,
      ['--import', fileURLToPath(import.meta.url), CLI, mode],
      {
        cwd,
        encoding: 'utf8',
        env: {
          PATH: join(cwd, 'bin'),
          RUNNER_TEMP: runner,
          GITHUB_OUTPUT: output,
          JOVIE_API_STATE_DIR: join(cwd, 'api-state'),
          JOVIE_GITHUB_CREDENTIAL: `fixture-${invocation++}`,
          GITHUB_REPOSITORY: 'JovieInc/Jovie',
          GITHUB_REF: 'refs/heads/main',
          GITHUB_RUN_ID: '500',
          GITHUB_RUN_ATTEMPT: '1',
          GITHUB_SHA: testedSha,
          GH_TOKEN: 'fixture-token',
          MUTATION_NEXT_FAKE_FETCH: '1',
          FAKE_GH_ROUTES: routesPath,
          FAKE_GH_CALLS: callsPath,
          ...extra,
        },
      }
    );
    return { ...result, output: readFileSync(output, 'utf8') };
  }
  function publishClaim() {
    const value = read(join(runner, 'mutation-next/claim.json'));
    const meta = artifact(
      `mutation-next-claim-${request.requestId}`,
      value.runId,
      value.transportSha,
      { 'claim.json': JSON.stringify(value) }
    );
    listing(meta.name, [meta]);
    return value;
  }
  function score(value) {
    state.sweepSequences['packages/ui'] = value.previousSequence + 1;
    const at = '2026-11-16T14:00:00.000Z';
    const recorded = recordEvidenceAttempt({
      state,
      file: FILE,
      blob: SHA,
      sha: testedSha,
      at,
      durationMs: 1000,
      source: 'export const fixture = true;',
      tests: ['atoms/form.test.tsx'],
      baseline: { files: { [FILE]: { floor: 80 } } },
      equivalents: { schemaVersion: 1, entries: [] },
      configDigest: 'a'.repeat(64),
      runId: state.sweepSequences['packages/ui'],
      timedOut: false,
      unchanged: true,
      mutants: Array.from({ length: 35 }, (_, id) => ({
        id: String(id),
        status: 'Killed',
        mutatorName: 'BooleanLiteral',
      })),
      receipt: {
        configDigest: 'a'.repeat(64),
        selectionDigest: 'b'.repeat(64),
        inputDigest: 'c'.repeat(64),
        inputs: [FILE],
        unresolvedInputs: [],
      },
    });
    assert.equal(recorded.entry.status, 'scored');
    const entry = recorded.entry;
    const history = `${JSON.stringify({
      at,
      file: FILE,
      sha: testedSha,
      mode: 'sweep',
      durationMs: 1000,
      status: entry.status,
      score: entry.score,
      valid: entry.valid,
      survived: entry.survived,
      ratchet: recorded.verdict.status,
      runUrl: 'https://github.com/JovieInc/Jovie/actions/runs/500',
    })}\n`;
    write(join(stateDir, 'sweep-state.json'), state);
    writeFileSync(join(stateDir, 'sweep-state.json.runs.jsonl'), history);
    return history;
  }
  return {
    cwd,
    callsPath,
    stateDir,
    runner,
    routes,
    request,
    state,
    testedSha,
    predecessorArtifact,
    run,
    artifact,
    listing,
    publication,
    publishClaim,
    score,
    close: () => rmSync(cwd, { recursive: true, force: true }),
  };
}

// Child-only preload: no route falls through to the real network.
if (process.env.MUTATION_NEXT_FAKE_FETCH === '1') {
  globalThis.fetch = async (input, options = {}) => {
    const url = new URL(input instanceof Request ? input.url : input);
    assert.equal(url.origin, 'https://api.github.com');
    const path = `${url.pathname.slice(1)}${url.search}`;
    const method =
      options.method ?? (input instanceof Request ? input.method : 'GET');
    const headers = new Headers(
      options.headers ?? (input instanceof Request ? input.headers : undefined)
    );
    assert.equal(headers.get('authorization'), 'Bearer fixture-token');
    if (method === 'POST') {
      const payload = JSON.parse(String(options.body));
      assert.equal(payload.return_run_details, true);
      assert.equal(payload.ref, 'main');
      assert.equal(payload.inputs.mode, 'sweep');
    }
    writeFileSync(
      process.env.FAKE_GH_CALLS,
      `${JSON.stringify([method, path])}\n`,
      { flag: 'a' }
    );
    const route = read(process.env.FAKE_GH_ROUTES)[path];
    assert.ok(route, `Unexpected fake GitHub route ${path}`);
    if (route.error) throw new TypeError(route.error);
    return new Response(
      route.binary ? readFileSync(route.binary) : JSON.stringify(route.json),
      {
        status: 200,
        headers: {
          'x-ratelimit-limit': '5000',
          'x-ratelimit-remaining': '4900',
          'x-ratelimit-reset': '4102444800',
          'content-type': route.binary ? 'application/zip' : 'application/json',
        },
      }
    );
  };
}

export { BASE, fixture, read, write };
