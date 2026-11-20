// JOV-13053. Run from protected main, immediately before a promotion mutation.
// Shadow only: every error is a HOLD receipt, never a failing workflow/check.
import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { ADMISSION_BLOCKING_LABELS } from './admission-hold-labels.mjs';
import {
  classifyCiRepoLanes,
  JOVIE_REQUIRED_CHECK_CONTEXTS,
} from './ci-repo-lanes.mjs';
import { retryDisposition, SHA } from './merge-queue-retry-policy.mjs';
import { isSizeExcluded } from './pr-size-exclusions.mjs';
import {
  evaluatePrSizePolicy,
  verifyIntegrationTrainSourceCoverage,
} from './pr-size-guard-policy.mjs';
import { evidenceMatches } from './prepush-offload.mjs';
import { classifyProductLanes } from './product-lane-classifier.mjs';
import { artifactJson, digest, githubIo } from './promotion-github.mjs';
import { evaluate, REQUIRED } from './promotion-readiness.mjs';

export const MAX_AGE_MS = 30 * 60 * 1000;
const fresh = (at, now) =>
  Number.isFinite(at) && at <= now && now - at <= MAX_AGE_MS;
export const metadataSha = pull =>
  digest([
    pull.title,
    pull.body ?? '',
    pull.labels.map(l => (typeof l === 'string' ? l : l.name)).sort(),
    pull.base.ref,
  ]);

export function guardrailValid(body) {
  const section = body
    ?.match(/^##\s+Guardrail\s*\n([\s\S]*?)(?=^##\s|(?![\s\S]))/im)?.[1]
    ?.replaceAll('*', '');
  if (!section || /\bN\/A\b|not applicable|\bTBD\b/i.test(section))
    return false;
  const fields = [
    /failure class[^\S\n]*:[^\S\n]*\S/i,
    /mechanism[^\S\n]*:[^\S\n]*\S/i,
    /(?:where )?enforced[^\S\n]*:[^\S\n]*\S/i,
    /(?:how it )?heals[^\S\n]*:[^\S\n]*\S/i,
    /simulation[^\S\n]*:[^\S\n]*\S/i,
  ];
  return (
    fields.every(re => re.test(section)) &&
    (/\bNOW\b/.test(section) ||
      (/\bLATER\b/.test(section) && /\bJOV-\d+\b/.test(section)))
  );
}

export function parityMatches(bundle, context, selected, now) {
  // Existing preflight-remote {sha,tree,rc,at} proves the existing gate only.
  // It is never relabeled as MQ parity without selected-suite + merged-tree proof.
  return (
    evidenceMatches(bundle, { sha: context.head, tree: context.headTree }) &&
    fresh(Date.parse(bundle.at), now) &&
    bundle.base === context.base &&
    bundle.mergedTree === context.tree &&
    bundle.policy === context.policy &&
    bundle.metadata === context.metadata &&
    bundle.suitesComplete === true &&
    JSON.stringify(bundle.selectedSuites) === JSON.stringify(selected)
  );
}

export async function collectPromotion(input, io, { now = NaN } = {}) {
  if (!Number.isFinite(now)) throw new Error('trusted clock required');
  const context = await io.context(input);
  const tuple = {
    repo: input.repo,
    pr: input.pr,
    head: context.head,
    base: context.base,
    tree: context.tree,
    policy: context.policy,
    metadata: context.metadata,
  };
  if (
    !Number.isSafeInteger(tuple.pr) ||
    tuple.pr < 1 ||
    !['head', 'base', 'tree', 'policy', 'metadata'].every(k =>
      SHA.test(tuple[k] ?? '')
    ) ||
    (input.expectedHead && tuple.head !== input.expectedHead)
  )
    throw new Error('promotion identity unavailable/moved');
  const evidence = {},
    errors = [];
  const gate = async (name, fn) => {
    try {
      const result = await fn();
      evidence[name] = {
        tuple,
        at: result.at ?? now,
        pass:
          result.pass === true &&
          (!result.tuple || isDeepStrictEqual(result.tuple, tuple)),
        detail: result.detail,
      };
    } catch (error) {
      evidence[name] = { tuple, at: now, pass: false };
      errors.push(`${name}: ${error.message}`);
    }
  };
  await gate('sourceChecks', () => io.sourceChecks(context));
  await gate('dryMerge', async () => ({
    pass:
      context.mergeParents?.[0] === context.base &&
      context.mergeParents?.[1] === context.head &&
      context.mergeable === true &&
      Number.isInteger(context.behind) &&
      context.behind <= 40 &&
      (context.behind === 0 ||
        (Number.isFinite(context.baseAgeMs) &&
          context.baseAgeMs >= 0 &&
          context.baseAgeMs <= 12 * 3600000)),
  }));
  await gate('sizePolicy', () => io.sizePolicy(context));
  await gate('guardrailSchema', async () => ({
    pass: guardrailValid(context.pull.body),
  }));
  await gate('holdsClear', async () => ({
    pass: !context.labels.some(l => ADMISSION_BLOCKING_LABELS.includes(l)),
  }));
  await gate('outsideReviewRecorded', () => io.outsideReview(context));
  await gate('retryBudget', async () => {
    const retry = await io.retry(context);
    return {
      pass: retryDisposition({
        head: context.head,
        labels: context.labels,
        ...retry,
      }).allow,
    };
  });
  await gate('mergeSuiteParity', async () => {
    const selected = await io.selectedSuites(context);
    const bundles = await io.bundles(context);
    const valid = bundles.find(b => parityMatches(b, context, selected, now));
    if (valid)
      return {
        pass: true,
        at: Date.parse(valid.at),
        detail: 'preflight-remote',
      };
    // Existing evidence (including an older bundle) never earns a second flight.
    // The adapter may dispatch only if the protected workflow supports the exact
    // path-selected suite contract. Current ci.yml dispatch runs everything.
    if (!bundles.length && io.dispatchSelected)
      await io.dispatchSelected({ context, selected });
    return {
      pass: false,
      detail: bundles.length
        ? 'preflight bundle lacks merged-tree suite parity'
        : 'selected-suite dispatch unavailable/pending',
    };
  });
  let queue, snapshot, health;
  try {
    const before = await io.queue(context);
    health = await io.health(context);
    const after = await io.queue(context);
    const main = await io.main();
    const current = await io.currentMetadata(input);
    const overlap = await io.overlap(context, before);
    // An actual shared lease is required. Local locks or per-PR workflow
    // concurrency do not fence the two different promotion controllers.
    const lease = io.lease ? await io.lease(tuple) : false;
    queue = { ...after, lease: lease === true, overlap };
    snapshot = {
      tuple,
      at: now,
      complete:
        before.complete === true &&
        current.metadata === tuple.metadata &&
        current.head === tuple.head,
      queueVersion: before.version,
    };
    return { tuple, evidence, queue, snapshot, health, main, errors };
  } catch (error) {
    errors.push(`queue: ${error.message}`);
    return { tuple, evidence, queue, snapshot, health, errors };
  }
}

export function collectorIo({
  repo = '',
  token = '',
  policy = '',
  maxLines = 800,
  maxFiles = 40,
  transport = undefined,
} = {}) {
  const net = transport ?? githubIo({ repo, token });
  const main = async () => (await net.get('git/ref/heads/main')).object.sha;
  const checks = async head => {
    const [runs, statuses] = await Promise.all([
      net.pages(`commits/${head}/check-runs`, 'check_runs'),
      net.pages(`commits/${head}/statuses`),
    ]);
    return [
      ...runs.map(r => ({
        name: r.name,
        pass: r.conclusion === 'success',
        at: Date.parse(r.completed_at),
        order: Date.parse(r.started_at ?? r.created_at),
        app: r.app?.id,
        trustedReview:
          r.app?.slug === 'github-actions' &&
          r.status === 'completed' &&
          r.details_url?.startsWith(`https://github.com/${repo}/actions/runs/`),
      })),
      ...statuses.map(s => ({
        name: s.context,
        pass: s.state === 'success',
        at: Date.parse(s.updated_at ?? s.created_at),
        order: Date.parse(s.updated_at ?? s.created_at),
        app: s.creator?.id,
      })),
    ];
  };
  return {
    main,
    async context({ pr }) {
      const pull = await net.get(`pulls/${pr}`);
      if (pull.base.ref !== 'main' || pull.head.repo?.full_name !== repo)
        throw new Error('same-repository main PR required');
      const base = await main();
      const [merge, head, compare, files] = await Promise.all([
        net.get(`git/commits/${pull.merge_commit_sha}`),
        net.get(`git/commits/${pull.head.sha}`),
        net.get(`compare/${pull.head.sha}...${base}`),
        net.pages(`pulls/${pr}/files`),
      ]);
      if (files.length !== pull.changed_files)
        throw new Error('PR file inventory incomplete');
      return {
        pr,
        pull,
        head: pull.head.sha,
        headTree: head.tree.sha,
        base,
        tree: merge.tree.sha,
        mergeParents: merge.parents.map(p => p.sha),
        mergeable: pull.mergeable,
        behind: compare.ahead_by,
        baseAgeMs:
          Date.parse((await net.get(`git/commits/${base}`)).committer.date) -
          Date.parse(compare.merge_base_commit.commit.committer.date),
        policy,
        metadata: metadataSha(pull),
        labels: pull.labels.map(l => l.name),
        files,
      };
    },
    async sourceChecks(c) {
      const rules = await net.pages('rules/branches/main');
      const required = rules
        .filter(r => r.type === 'required_status_checks')
        .flatMap(r => r.parameters.required_status_checks);
      if (!required.length) throw new Error('required contexts unavailable');
      // Source aggregates are canonical, and live rules may add more. Never
      // treat a missing required context or an empty response as vacuous green.
      const all = [
        ...required,
        ...JOVIE_REQUIRED_CHECK_CONTEXTS.map(context => ({ context })),
      ];
      const observed = await checks(c.head);
      const latest = all.map(
        r =>
          observed
            .filter(
              o =>
                o.name === r.context &&
                (!r.integration_id || r.integration_id === o.app)
            )
            .sort((a, b) => b.order - a.order)[0]
      );
      return {
        pass: latest.every(r => r?.pass === true),
        at: Math.min(...latest.map(r => r?.at ?? 0)),
      };
    },
    async sizePolicy(c) {
      // Same exclusions and evaluator the queue uses; no duplicate caps/policy.
      const counted = c.files.filter(f => !isSizeExcluded(f.filename));
      const result = evaluatePrSizePolicy({
        labels: c.labels,
        body: c.pull.body,
        lines: counted.reduce((n, f) => n + f.additions + f.deletions, 0),
        files: counted.length,
        maxLines,
        maxFiles,
      });
      if (result.policy === 'integration-train' && result.passed)
        await verifyIntegrationTrainSourceCoverage({
          body: c.pull.body,
          trainNumber: c.pr,
          loadPull: pr => net.get(`pulls/${pr}`),
          loadFiles: async pr =>
            (await net.pages(`pulls/${pr}/files`)).map(f => f.filename),
        });
      // Opt-outs are the existing size workflow's policy, not a new bypass.
      return {
        pass:
          c.labels.some(l => ['big-pr', 'codemod'].includes(l)) ||
          result.passed,
        detail: result.reason,
      };
    },
    async outsideReview(c) {
      const observed = await checks(c.head);
      const review = observed
        .filter(
          r =>
            r.trustedReview &&
            /outside.?review|independent.?review/i.test(r.name)
        )
        .sort((a, b) => b.at - a.at)[0];
      // Required for this critical-config lane; a completed presence receipt is
      // sufficient. Review content/conclusion is never a new promotion gate.
      return {
        pass: Boolean(review && Number.isFinite(review.at)),
        at: review?.at ?? 0,
      };
    },
    retry: c => net.readRetryEvidence({ pr: c.pr, head: c.head }),
    async selectedSuites(c) {
      // Exactly the queue's product/path classifiers; no pinned shard names.
      const paths = c.files.map(f => f.filename);
      const product = classifyProductLanes(paths);
      const lanes = classifyCiRepoLanes(paths);
      return { product, lanes };
    },
    async bundles(c) {
      const statuses = await net.pages(`commits/${c.head}/statuses`);
      const refs = new Set([c.head, `refs/preflight/${c.head}`]);
      // Only the existing workflow's trusted artifact is considered. Arbitrary
      // preflight/changed status descriptions are not JSON attestations.
      for (const s of statuses.filter(s => s.context === 'preflight/changed')) {
        const match = new RegExp(
          `^https://github\\.com/${repo}/actions/runs/(\\d+)$`
        ).exec(s.target_url ?? '');
        if (match) refs.add(Number(match[1]));
      }
      const runs = await net.pages(
        `actions/workflows/preflight-remote.yml/runs?event=workflow_dispatch`,
        'workflow_runs'
      );
      const bundles = [];
      for (const run of runs.filter(
        r => refs.has(r.head_sha) || refs.has(r.head_branch) || refs.has(r.id)
      )) {
        for (const artifact of (
          await net.pages(`actions/runs/${run.id}/artifacts`, 'artifacts')
        ).filter(a => a.name === 'preflight-evidence' && !a.expired)) {
          const zip = await net.api(
            `repos/${repo}/actions/artifacts/${artifact.id}/zip`,
            { binary: true }
          );
          bundles.push(artifactJson(zip, 'evidence.json'));
        }
      }
      return bundles;
    },
    queue: net.queue,
    health: net.health,
    currentMetadata: async ({ pr }) => {
      const pull = await net.get(`pulls/${pr}`);
      return { metadata: metadataSha(pull), head: pull.head.sha };
    },
    async overlap(c, queue) {
      // A nonempty queue requires a tested combined tree, never file overlap
      // guesses. The native queue continues to own integration in shadow.
      return queue.entries.some(e => e.pullRequest.number !== c.pr)
        ? 'unknown'
        : 'clean';
    },
  };
}

export async function promotionVerdict(input, io, { now = NaN } = {}) {
  try {
    const collected = await collectPromotion(input, io, { now });
    // Every REQUIRED gate is included even when an individual adapter fails.
    if (REQUIRED.some(name => !collected.evidence[name]))
      throw new Error('collector omitted a required gate');
    return {
      schema: 'promotion-bar/v1',
      mode: 'shadow',
      ...evaluate(collected, { now }),
      errors: collected.errors,
    };
  } catch (error) {
    return {
      schema: 'promotion-bar/v1',
      mode: 'shadow',
      ready: false,
      failures: ['collector'],
      errors: [error.message],
      probability: null,
    };
  }
}

export async function logPromotion(
  input,
  io,
  { now = Date.now(), summary = '', log = console.log } = {}
) {
  const verdict = await promotionVerdict(input, io, { now });
  const json = JSON.stringify(verdict);
  log(json);
  if (summary) {
    try {
      appendFileSync(summary, `\n\`\`\`json\n${json}\n\`\`\`\n`);
    } catch {
      /* observation must not fail admission */
    }
  }
  return verdict;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    const repo = process.env.REPO ?? process.env.GITHUB_REPOSITORY;
    const policy = execFileSync('git', ['rev-parse', 'HEAD'], {
      encoding: 'utf8',
    }).trim();
    await logPromotion(
      {
        repo,
        pr: Number(process.env.PROMOTION_PR),
        expectedHead: process.env.PROMOTION_HEAD,
      },
      collectorIo({
        repo,
        token: process.env.GH_TOKEN,
        policy,
        maxLines: Number(process.env.MAX_LINES ?? 800),
        maxFiles: Number(process.env.MAX_FILES ?? 40),
      }),
      { summary: process.env.GITHUB_STEP_SUMMARY }
    );
  } catch (error) {
    const json = JSON.stringify({
      schema: 'promotion-bar/v1',
      mode: 'shadow',
      ready: false,
      failures: ['collector'],
      errors: [error.message],
    });
    console.log(json);
    if (process.env.GITHUB_STEP_SUMMARY) {
      try {
        appendFileSync(process.env.GITHUB_STEP_SUMMARY, `\n${json}\n`);
      } catch {
        /* advisory */
      }
    }
  }
}
