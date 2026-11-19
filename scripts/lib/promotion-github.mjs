// api-budget: github-app-core 1200/hr - bounded evidence for enqueue candidates and event-driven ejection feedback
// Trusted GitHub transport shared by the shadow collector and ejection feedback.
// No PR code is checked out or executed. Every request/clock is injectable.
import { createHash } from 'node:crypto';
import { inflateRawSync } from 'node:zlib';
import { createGitHubClient } from '../../packages/api-client/github.ts';
import {
  parseTrustedFailureStatus,
  parseTrustedRetryStatus,
} from '../merge-group-failure-hold.mjs';
import { JOVIE_REQUIRED_CHECK_CONTEXTS } from './ci-repo-lanes.mjs';
import {
  parseQueueBranch,
  retryDisposition,
  trustedRetryCount,
} from './merge-queue-retry-policy.mjs';

export { retryDisposition } from './merge-queue-retry-policy.mjs';

export const digest = value =>
  createHash('sha1').update(JSON.stringify(value)).digest('hex');

export async function reconcileQueueRetry(input, net) {
  try {
    const [evidence, health] = await Promise.all([
      net.readRetryEvidence(input),
      net.health(),
    ]);
    return {
      ...retryDisposition({
        ...input,
        ...evidence,
        complete: evidence.complete && health.complete,
        circuitOpen: health.circuitOpen,
      }),
      evidence,
    };
  } catch {
    return {
      allow: false,
      reason: 'head-unchanged-non-infra',
      retry: false,
      evidence: undefined,
    };
  }
}

// Keep evidence reads, retry reservations and enqueue effects in their original order.
export async function reconcileVictimRearms(
  candidates,
  net,
  { plan, apply, enqueue, exec = undefined, log = console.log, ...io }
) {
  for (const candidate of candidates) {
    const decision = await reconcileQueueRetry(
      {
        pr: candidate.prNumber,
        head: candidate.headSha,
        labels: candidate.labels,
      },
      net
    );
    candidate.retryEvidence = {
      ...(decision.evidence ?? { complete: false }),
      circuitOpen: decision.reason === 'circuit-open',
    };
  }
  const decisions = plan();
  return apply(decisions, {
    ...io,
    async enable(prNumber, current) {
      const decision = decisions.find(d => d.prNumber === prNumber);
      if (decision?.retry) {
        const candidate = candidates.find(c => c.prNumber === prNumber);
        const last = candidate.retryEvidence.receipts.at(-1);
        await net.reserveRetry({
          head: current.headSha,
          run: last.run,
          attempt: last.attempt,
        });
      }
      const result = enqueue({
        prNumber,
        nodeId: current?.nodeId,
        headOid: current?.headSha,
        exec,
      });
      log(`enqueued #${prNumber} at position ${result.position}`);
    },
  }).then(applied => {
    for (const decision of decisions) {
      log(
        decision.action === 'rearm'
          ? `rearm #${decision.prNumber} class=${decision.classification} reason=${decision.reason} n=${decision.n} increment=${decision.increment} run=${decision.runId}`
          : `skip #${decision.prNumber} ${decision.reason}`
      );
    }
    log(`applied=${applied.length}`);
  });
}

// Read a single bounded JSON member without extracting paths or executing tools.
export function artifactJson(buffer, filename) {
  const data = Buffer.from(buffer);
  for (let i = Math.max(0, data.length - 65557); i <= data.length - 22; i++) {
    if (data.readUInt32LE(i) !== 0x06054b50) continue;
    let pos = data.readUInt32LE(i + 16);
    const count = data.readUInt16LE(i + 10);
    for (let n = 0; n < count; n++) {
      if (data.readUInt32LE(pos) !== 0x02014b50)
        throw new Error('invalid artifact directory');
      const size = data.readUInt32LE(pos + 20),
        expanded = data.readUInt32LE(pos + 24);
      const length = data.readUInt16LE(pos + 28);
      const name = data.subarray(pos + 46, pos + 46 + length).toString();
      if (name === filename) {
        if (size > 1048576 || expanded > 1048576)
          throw new Error('artifact too large');
        const offset = data.readUInt32LE(pos + 42);
        if (data.readUInt32LE(offset) !== 0x04034b50)
          throw new Error('invalid artifact member');
        const start =
          offset +
          30 +
          data.readUInt16LE(offset + 26) +
          data.readUInt16LE(offset + 28);
        const compressed = data.subarray(start, start + size);
        const method = data.readUInt16LE(pos + 10);
        const json =
          method === 0
            ? compressed
            : method === 8
              ? inflateRawSync(compressed, { maxOutputLength: 1048576 })
              : null;
        if (!json) throw new Error('unsupported artifact compression');
        return JSON.parse(json.toString());
      }
      pos +=
        46 + length + data.readUInt16LE(pos + 30) + data.readUInt16LE(pos + 32);
    }
  }
  throw new Error('artifact member absent');
}

export function githubIo({
  repo = '',
  token = '',
  fetch: request = globalThis.fetch,
  now = Date.now,
  clientOptions = {},
} = {}) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo ?? ''))
    throw new Error('invalid repository');
  const [owner, name] = repo.split('/');
  const client = createGitHubClient({
    ...clientOptions,
    token: token ?? '',
    now,
    fetch: async (url, options) => {
      const response = await request(url, options);
      // The shared client stores textual API responses. Preserve ZIP bytes in
      // a JSON envelope so artifact reads still use its ledger and budgets.
      if (!new URL(url).pathname.endsWith('/zip') || !response.ok)
        return response;
      const archiveBase64 = Buffer.from(await response.arrayBuffer()).toString(
        'base64'
      );
      return new Response(JSON.stringify({ archiveBase64 }), {
        status: response.status,
        headers: {
          ...Object.fromEntries(response.headers),
          'content-type': 'application/json',
        },
      });
    },
  });
  /** @overload @param {string} path @param {{method?: string, body?: unknown, binary: true}} options @returns {Promise<Buffer>} */
  /** @overload @param {string} path @param {{method?: string, body?: unknown, binary?: false}} [options] @returns {Promise<import('./promotion-github-types.js').GitHubJson>} */
  /** @param {string} path @param {{method?: string, body?: unknown, binary?: boolean}} [options] */
  async function api(path, { method = 'GET', body, binary = false } = {}) {
    if (!token) throw new Error('trusted token unavailable');
    const response = await client.rest(method, path, body, {
      priority: 'merge',
      maxAttempts: 1,
      maxWaitMs: 0,
      timeoutMs: 10000,
      conditional: false,
    });
    if (response.status < 200 || response.status >= 300)
      throw new Error(`GitHub ${response.status}: ${path.split('?')[0]}`);
    const json =
      /** @type {import('./promotion-github-types.js').GitHubJson} */ (
        response.json()
      );
    return binary
      ? Buffer.from(json.archiveBase64, 'base64')
      : response.status === 204
        ? null
        : json;
  }
  const get = path => api(`repos/${repo}/${path}`);
  const pages = async (path, key) => {
    const rows = [];
    for (let page = 1; page <= 50; page++) {
      const value = await get(
        `${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`
      );
      const batch = key ? value[key] : value;
      if (!Array.isArray(batch)) throw new Error('incomplete GitHub list');
      rows.push(...batch);
      if (batch.length < 100) {
        if (
          key &&
          Number.isInteger(value.total_count) &&
          rows.length < value.total_count
        )
          throw new Error('truncated GitHub list');
        return rows;
      }
    }
    throw new Error('GitHub pagination bound reached');
  };
  const graphql = async (query, variables) => {
    const result = await api('graphql', {
      method: 'POST',
      body: { query, variables },
    });
    if (result.errors?.length) throw new Error('GraphQL evidence incomplete');
    return result.data;
  };
  const jobs = run =>
    pages(
      `actions/runs/${run.id}/attempts/${run.run_attempt ?? 1}/jobs`,
      'jobs'
    );
  const annotatedJobs = async run =>
    Promise.all(
      (await jobs(run)).map(async job => {
        if (!['failure', 'timed_out', 'cancelled'].includes(job.conclusion))
          return job;
        if (!job.check_run_url) return job;
        const checkId = job.check_run_url.split('/').at(-1);
        const annotations = await pages(`check-runs/${checkId}/annotations`);
        return {
          ...job,
          annotations,
          required: JOVIE_REQUIRED_CHECK_CONTEXTS.includes(job.name),
        };
      })
    );
  const readRetryEvidence = async ({ pr, head }) => {
    const branch = `gh-readonly-queue/main/pr-${pr}-${head}`;
    const [runs, statuses] = await Promise.all([
      pages(
        `actions/runs?event=merge_group&branch=${encodeURIComponent(branch)}`,
        'workflow_runs'
      ),
      pages(`commits/${head}/statuses`),
    ]);
    const { classifyRun } = await import('./ejection-classifier.mjs');
    const receipts = [];
    for (const run of runs) {
      if (
        ![
          'failure',
          'timed_out',
          'cancelled',
          'startup_failure',
          'action_required',
        ].includes(run.conclusion)
      )
        continue;
      // Prefer the classifier's durable attribution (especially systemic). A
      // label alone cannot identify its head or survive a classifier/enroll race.
      const artifacts = await pages(
        `actions/artifacts?name=ejection-${run.id}`,
        'artifacts'
      );
      let recorded;
      for (const artifact of artifacts.filter(
        a => !a.expired && a.name === `ejection-${run.id}`
      )) {
        const producer = await get(`actions/runs/${artifact.workflow_run?.id}`);
        if (
          producer.path !== '.github/workflows/ejection-classifier.yml' ||
          producer.event !== 'workflow_run' ||
          producer.head_branch !== 'main' ||
          producer.head_repository?.full_name !== repo
        )
          continue;
        const zip = await api(
          `repos/${repo}/actions/artifacts/${artifact.id}/zip`,
          { binary: true }
        );
        const receipt = artifactJson(zip, 'ejection.json');
        if (
          receipt.schema === 'ejection/v1' &&
          receipt.repo === repo &&
          receipt.pr === pr &&
          receipt.head === head &&
          receipt.run === run.id &&
          receipt.attempt === (run.run_attempt ?? 1)
        )
          recorded = receipt;
      }
      receipts.push(
        recorded ??
          classifyRun({
            repo,
            run,
            jobs: await annotatedJobs(run),
            now: Date.parse(run.updated_at),
          })
      );
    }
    // Existing failure holds also survive old/deleted Actions history.
    for (const status of statuses) {
      const failure = parseTrustedFailureStatus(status, repo);
      if (!failure) continue;
      const cls =
        {
          'transient-infrastructure': 'infra',
          'deterministic-source': 'code',
          'base-branch': 'systemic',
        }[failure.classification] ?? 'code';
      if (!receipts.some(r => r.run === failure.runId))
        receipts.push({
          schema: 'ejection/v1',
          head,
          run: failure.runId,
          attempt: failure.runAttempt,
          class: cls,
          at: status.created_at,
        });
    }
    const oldRetries = new Set(
      statuses
        .map(s => parseTrustedRetryStatus(s, repo))
        .filter(s => s && !s.released)
        .map(s => `${s.runId}:${s.runAttempt}`)
    ).size;
    return {
      complete: true,
      runs,
      receipts,
      retries: trustedRetryCount(statuses) + oldRetries,
    };
  };
  const queue = async () => {
    const entries = [];
    let cursor = null;
    for (let page = 0; page < 50; page++) {
      const data = await graphql(
        `query($owner:String!,$name:String!,$cursor:String){repository(owner:$owner,name:$name){mergeQueue(branch:"main"){entries(first:100,after:$cursor){nodes{id position headCommit{oid} baseCommit{oid} pullRequest{number headRefOid}} pageInfo{hasNextPage endCursor}}}}}`,
        { owner, name, cursor }
      );
      const connection = data.repository?.mergeQueue?.entries;
      if (!connection?.nodes || !connection.pageInfo)
        throw new Error('queue unavailable');
      entries.push(...connection.nodes);
      if (!connection.pageInfo.hasNextPage)
        return { complete: true, entries, version: digest(entries) };
      if (
        !connection.pageInfo.endCursor ||
        connection.pageInfo.endCursor === cursor
      )
        break;
      cursor = connection.pageInfo.endCursor;
    }
    throw new Error('queue snapshot incomplete');
  };
  const health = async () => {
    const runs = await pages(
      `actions/runs?created=${encodeURIComponent(`>=${new Date(now() - 2 * 3600000).toISOString()}`)}`,
      'workflow_runs'
    );
    const main = runs
      .filter(
        r => r.event === 'push' && r.head_branch === 'main' && r.name === 'CI'
      )
      .sort((a, b) => b.id - a.id)[0];
    const failures = [];
    for (const run of runs.filter(
      r => r.event === 'merge_group' && r.conclusion === 'failure'
    )) {
      const parsed = parseQueueBranch(run.head_branch);
      if (!parsed) continue;
      for (const job of (await jobs(run)).filter(
        j => j.conclusion === 'failure'
      ))
        failures.push({
          pr: parsed.pr,
          job: job.name,
          at: Date.parse(run.updated_at),
        });
    }
    const counts = new Map();
    for (const f of failures.filter(
      f =>
        !main ||
        f.at > Date.parse(main.updated_at) ||
        main.conclusion !== 'success'
    )) {
      if (!counts.has(f.job)) counts.set(f.job, new Set());
      counts.get(f.job).add(f.pr);
    }
    return {
      complete: Boolean(main),
      circuitOpen:
        !main ||
        main.conclusion !== 'success' ||
        [...counts.values()].some(s => s.size >= 3),
    };
  };
  return {
    api,
    get,
    pages,
    graphql,
    jobs,
    annotatedJobs,
    readRetryEvidence,
    queue,
    health,
    async reserveRetry({ head, run, attempt = 1 }) {
      return api(`repos/${repo}/statuses/${head}`, {
        method: 'POST',
        body: {
          state: 'success',
          context: 'mq-retry/v1',
          description: `spent:run=${run};try=${attempt}`,
          target_url: `https://github.com/${repo}/actions/runs/${run}`,
        },
      });
    },
  };
}
