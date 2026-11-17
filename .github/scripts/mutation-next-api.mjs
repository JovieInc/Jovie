// api-budget: github-actions-token 60/hr - serialized producer, capped at 60 calls/run for publication reads and one non-idempotent wake
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { ghCredential } from '../../packages/api-client/gh.ts';
import { createGitHubClient } from '../../packages/api-client/github.ts';
export const REPO = 'JovieInc/Jovie';
export const sha256 = text => createHash('sha256').update(text).digest('hex');
export const json = path => JSON.parse(readFileSync(path, 'utf8'));
export const optional = path => (existsSync(path) ? json(path) : null);
const assert = (value, reason) => {
  if (!value) throw new Error(reason);
};
export const atomic = (path, value) => {
  mkdirSync(resolve(path, '..'), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, {
    mode: 0o600,
  });
  renameSync(temporary, path);
};
export const command = (args, options = {}) => {
  const r = spawnSync(args[0], args.slice(1), {
    encoding: 'utf8',
    timeout: 15000,
    maxBuffer: 32 * 1024 * 1024,
    ...options,
  });
  assert(r.status === 0, `${args[0]} evidence unavailable`);
  return r.stdout;
};

export const directory = () => {
  const path = join(process.env.RUNNER_TEMP ?? tmpdir(), 'mutation-next');
  mkdirSync(path, { recursive: true });
  return path;
};

export async function github(args, { binary = false } = {}) {
  const budgetPath = join(directory(), 'api-calls.json');
  const identity = `${process.env.GITHUB_RUN_ID}/${process.env.GITHUB_RUN_ATTEMPT}`;
  const budget = optional(budgetPath);
  const used = budget?.identity === identity ? budget.used : 0;
  assert(
    Number.isSafeInteger(used) && used >= 0 && used < 60,
    'bounded handoff evidence budget exhausted; intent retained'
  );
  atomic(budgetPath, { identity, used: used + 1 });
  assert(args[0] === 'api', 'only canonical REST operations are supported');
  const path = args.find(arg => arg.startsWith(`repos/${REPO}/`));
  assert(
    path && !path.includes('..') && !/[\\\r\n]/u.test(path),
    'invalid canonical repository route'
  );
  const methodIndex = args.indexOf('--method'),
    inputIndex = args.indexOf('--input');
  const method = methodIndex < 0 ? 'GET' : args[methodIndex + 1];
  assert(
    method === 'GET' || method === 'POST',
    'unsupported handoff operation'
  );
  const token = process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN;
  assert(token, 'canonical producer token unavailable');
  const client = createGitHubClient({
    token,
    credential: ghCredential(process.env),
    fetch: binary
      ? async (input, init) => {
          const response = await fetch(input, init);
          if (response.status !== 200) return response;
          const bytes = Buffer.from(await response.arrayBuffer());
          assert(
            bytes.length <= 32 * 1024 * 1024,
            'artifact archive too large'
          );
          const headers = new Headers(response.headers);
          headers.set('content-type', 'application/octet-stream');
          headers.set('cache-control', 'no-store');
          return new Response(bytes.toString('base64'), {
            status: response.status,
            headers,
          });
        }
      : undefined,
  });
  const result = await client.rest(
    method,
    path,
    inputIndex < 0 ? undefined : json(args[inputIndex + 1]),
    {
      priority: 'default',
      costs: { core: 1 },
      write: method === 'POST',
      idempotent: method === 'GET',
      maxAttempts: 1,
      maxWaitMs: 0,
      timeoutMs: 15000,
      conditional: false,
      coalesce: false,
    }
  );
  assert(
    result.status >= 200 && result.status < 300,
    'GitHub evidence unavailable; request not retried'
  );
  return binary ? Buffer.from(result.text, 'base64') : result.text;
}
export const api = async path =>
  JSON.parse(String(await github(['api', path])));
export const base = `repos/${REPO}`;
export async function artifacts(name) {
  const r = await api(
    `${base}/actions/artifacts?name=${encodeURIComponent(name)}&per_page=100`
  );
  assert(
    Number.isSafeInteger(r.total_count) &&
      Array.isArray(r.artifacts) &&
      r.total_count === r.artifacts.length &&
      r.total_count <= 100,
    'artifact history incomplete'
  );
  assert(
    r.artifacts.every(a => a.name === name && a.expired === false),
    'artifact history expired or mismatched'
  );
  return r.artifacts;
}

export async function archive(artifact) {
  const bytes = await github(
    ['api', `${base}/actions/artifacts/${artifact.id}/zip`],
    { binary: true }
  );
  assert(
    artifact.digest === `sha256:${sha256(bytes)}`,
    'artifact archive digest mismatch'
  );
  const directory = mkdtempSync(join(tmpdir(), 'mutation-next-evidence-'));
  const path = join(directory, 'artifact.zip');
  writeFileSync(path, bytes);
  return {
    read(name, required = true) {
      const program =
        'import sys,zipfile\nz=zipfile.ZipFile(sys.argv[1]);n=sys.argv[2];v=[x for x in z.infolist() if x.filename==n]\nif not v:sys.exit(3)\nassert len(v)==1 and v[0].file_size<=16777216\nsys.stdout.buffer.write(z.read(v[0]))';
      const r = spawnSync('python3', ['-c', program, path, name], {
        encoding: 'utf8',
        timeout: 15000,
        maxBuffer: 17 * 1024 * 1024,
      });
      if (!required && r.status === 3) return null;
      assert(
        r.status === 0,
        'artifact member missing, duplicated or oversized'
      );
      return r.stdout;
    },
    close() {
      rmSync(directory, { recursive: true, force: true });
    },
  };
}

export async function transport(runId, runAttempt) {
  const [run, latestRun, jobs] = await Promise.all([
    api(`${base}/actions/runs/${runId}/attempts/${runAttempt}`),
    api(`${base}/actions/runs/${runId}`),
    api(
      `${base}/actions/runs/${runId}/attempts/${runAttempt}/jobs?per_page=100`
    ),
  ]);
  assert(
    Array.isArray(jobs.jobs) && jobs.total_count === jobs.jobs.length,
    'job evidence incomplete'
  );
  return { run, latestRun, jobs };
}

export async function publication(predecessor) {
  const evidence = await transport(predecessor.runId, predecessor.runAttempt);
  const listed = await api(
    `${base}/actions/runs/${predecessor.runId}/artifacts?per_page=100`
  );
  assert(
    Array.isArray(listed.artifacts) &&
      listed.total_count === listed.artifacts.length,
    'publication artifact listing incomplete'
  );
  const matches = listed.artifacts.filter(
    a => a.name === predecessor.artifactName && !a.expired
  );
  assert(matches.length === 1, 'missing or ambiguous predecessor publication');
  const artifact = matches[0],
    zip = await archive(artifact);
  try {
    const receipt = JSON.parse(zip.read('producer-receipt.json'));
    const stateText = zip.read('sweep-state.json'),
      historyText = zip.read('sweep-state.json.runs.jsonl', false);
    const caches = await api(
      `${base}/actions/caches?key=${encodeURIComponent(predecessor.cacheKey)}&ref=refs%2Fheads%2Fmain&per_page=100`
    );
    assert(
      Array.isArray(caches.actions_caches) &&
        caches.total_count === caches.actions_caches.length,
      'cache evidence incomplete'
    );
    const exact = caches.actions_caches.filter(
      c => c.key === predecessor.cacheKey && c.ref === 'refs/heads/main'
    );
    assert(exact.length === 1, 'exact predecessor cache missing or ambiguous');
    return {
      ...evidence,
      artifact,
      receipt,
      stateText,
      historyText,
      cache: exact[0],
      snapshotResult: optionalMember(zip, 'next-target-result.json'),
    };
  } finally {
    zip.close();
  }
}
export const optionalMember = (zip, name) => {
  const text = zip.read(name, false);
  return text === null ? null : JSON.parse(text);
};
