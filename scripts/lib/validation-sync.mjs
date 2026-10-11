/**
 * Facts and one evaluation step for the Linear validation lifecycle
 * (JOV-7694). GitHub reads are read-only: the served production build, its
 * Production Verified marker, commit ancestry, merged pull requests linked to
 * an issue, and the existing CI risk classification (JOV-5937) of their
 * files. Linear writes go through a port the merge-sync writer supplies.
 */

import { uiEvidenceRequirements } from '../invariants/assurance-matrix.mjs';
import { classifyCiRisk } from './ci-harness.mjs';
import { evaluateEscapedDefectClosure } from './escaped-defect-closure.mjs';
import {
  founderTasteOrder,
  readTasteOrders,
  renderTasteOrder,
  tasteOrderId,
  tasteReceiptsFromResults,
} from './founder-taste-order.mjs';
import {
  decideValidationTransition,
  deriveValidationManifest,
  formatLifecycleComment,
  latestLifecycleStatusKey,
  lifecycleStatusKey,
  parseValidationReceipts,
} from './validation-lifecycle.mjs';

// Long-running issues collect many linked pull requests (JOV-7707 had more
// than 10 on its first live run). The cap only bounds GitHub reads.
const MAX_LINKED_PULLS = 60;
const MAX_FILE_PAGES = 30;
const PRODUCTION_VERSION_URL = 'https://jov.ie/api/version';

/**
 * @typedef {{
 *   ok: boolean,
 *   status?: number,
 *   json: () => Promise<unknown>,
 *   headers?: { get?: (name: string) => string | null | undefined },
 * }} HttpResponse
 * @typedef {(
 *   input: string | URL | Request,
 *   init?: RequestInit,
 * ) => Promise<HttpResponse>} HttpFetch
 * @typedef {(path: string) => Promise<{ body: any, link: string }>} GithubGet
 * @typedef {{
 *   status: 'verified' | 'pending' | 'unknown',
 *   sha?: string,
 *   detail?: string,
 * }} DeploymentFact
 * @typedef {{
 *   number: number,
 *   url: string,
 *   mergeSha: string,
 *   mergedAt: string,
 * }} MergedPull
 * @typedef {{
 *   riskLevel: string,
 *   blocksUnattendedAutoMerge: boolean,
 *   matchedRules: string[],
 * }} RiskSummary
 */

/**
 * One retry for a transport failure (a thrown fetch, not an HTTP status), so a
 * dropped connection on a loaded runner does not fail the whole sweep.
 *
 * @param {HttpFetch} fetchImpl
 * @param {Parameters<HttpFetch>} args
 * @returns {Promise<HttpResponse>}
 */
export async function fetchWithRetry(fetchImpl, ...args) {
  try {
    return await fetchImpl(...args);
  } catch {
    return fetchImpl(...args);
  }
}

/**
 * @param {HttpFetch} fetchImpl
 * @param {string} token
 * @returns {GithubGet}
 */
export function githubClient(fetchImpl, token) {
  return async path => {
    // Bounded retry for transient GitHub upstream failures: a 503 from
    // api.github.com used to fail the whole lifecycle evaluation (JOV-5143,
    // run 37818346153) even though the next sweep would have converged.
    // Mirrors the Linear retry in linear-sync-on-merge.mjs: 4 attempts,
    // exponential backoff; persistent errors and 4xx still throw.
    const maxAttempts = 4;
    /** @type {Error | null} */
    let lastError = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const response = await fetchWithRetry(
        fetchImpl,
        `https://api.github.com/${path}`,
        {
          headers: {
            Accept: 'application/vnd.github+json',
            Authorization: `Bearer ${token}`,
            'X-GitHub-Api-Version': '2022-11-28',
            'User-Agent': 'jovie-linear-sync-on-merge',
          },
        }
      );
      if (response.ok) {
        return {
          body: await response.json(),
          link: response.headers?.get?.('link') ?? '',
        };
      }
      lastError = new Error(
        `GitHub HTTP ${response.status ?? 'error'} for ${path}`
      );
      const retryable =
        response.status === 429 ||
        (typeof response.status === 'number' && response.status >= 500);
      if (!retryable || attempt === maxAttempts) throw lastError;
      // Exponential backoff, bounded for the 15-minute sweep budget.
      const delayMs = Math.min(4_000, 2 ** (attempt - 1) * 250);
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
    throw lastError ?? new Error(`GitHub request failed for ${path}`);
  };
}

/**
 * Production facts shared by every issue in one run, each read once.
 *
 * @param {{
 *   readonly fetchImpl: HttpFetch,
 *   readonly github: GithubGet,
 *   readonly repository: string,
 *   readonly versionUrl?: string,
 * }} input
 */
export function createProductionFacts(input) {
  /** @type {Map<string, Promise<boolean>>} */
  const markers = new Map();
  /** @type {Map<string, Promise<boolean>>} */
  const ancestry = new Map();
  /** @type {Promise<DeploymentFact> | null} */
  let served = null;

  /** @param {string} sha */
  const hasVerifiedMarker = sha => {
    const key = sha.toLowerCase();
    if (!markers.has(key)) {
      markers.set(
        key,
        input
          .github(
            `repos/${input.repository}/actions/artifacts?name=production-generation-verified-${key}&per_page=100`
          )
          .then(({ body }) => {
            if (!body || !Array.isArray(body.artifacts)) {
              throw new Error(
                'GitHub returned malformed Production Verified markers'
              );
            }
            return body.artifacts.some(
              /** @param {any} artifact */
              artifact =>
                artifact?.expired === false &&
                artifact?.name === `production-generation-verified-${key}` &&
                artifact?.workflow_run?.head_branch === 'main'
            );
          })
      );
    }
    return /** @type {Promise<boolean>} */ (markers.get(key));
  };

  /**
   * True when `head` contains `base` (identical or ahead).
   * @param {string} base
   * @param {string} head
   */
  const contains = (base, head) => {
    const key = `${base}...${head}`.toLowerCase();
    if (!ancestry.has(key)) {
      ancestry.set(
        key,
        input
          .github(`repos/${input.repository}/compare/${base}...${head}`)
          .then(({ body }) => {
            const status = String(body?.status ?? '');
            if (
              !['identical', 'ahead', 'behind', 'diverged'].includes(status)
            ) {
              throw new Error(
                `GitHub compare returned ${status || 'no status'}`
              );
            }
            return status === 'identical' || status === 'ahead';
          })
      );
    }
    return /** @type {Promise<boolean>} */ (ancestry.get(key));
  };

  const servedGeneration = () => {
    served ??= (async () => {
      try {
        const response = await input.fetchImpl(
          input.versionUrl ?? PRODUCTION_VERSION_URL,
          { headers: { 'Cache-Control': 'no-cache' } }
        );
        if (!response.ok) {
          return {
            status: /** @type {const} */ ('unknown'),
            detail: `production version HTTP ${response.status}`,
          };
        }
        const payload = /** @type {{ buildId?: unknown }} */ (
          await response.json()
        );
        const buildId = String(payload?.buildId ?? '').toLowerCase();
        if (!/^[0-9a-f]{7,40}$/.test(buildId)) {
          return {
            status: /** @type {const} */ ('unknown'),
            detail: `production build id ${buildId || 'missing'} is not a commit`,
          };
        }
        const { body } = await input.github(
          `repos/${input.repository}/commits/${buildId}`
        );
        const sha = String(body?.sha ?? '').toLowerCase();
        if (!/^[0-9a-f]{40}$/.test(sha) || !sha.startsWith(buildId)) {
          return {
            status: /** @type {const} */ ('unknown'),
            detail: `production build ${buildId} did not resolve to one commit`,
          };
        }
        if (!(await hasVerifiedMarker(sha))) {
          return {
            status: /** @type {const} */ ('pending'),
            sha,
            detail: `served build ${sha.slice(0, 12)} has no Production Verified marker`,
          };
        }
        return { status: /** @type {const} */ ('verified'), sha };
      } catch (error) {
        return {
          status: /** @type {const} */ ('unknown'),
          detail: error instanceof Error ? error.message : String(error),
        };
      }
    })();
    return served;
  };

  return { hasVerifiedMarker, contains, servedGeneration };
}

/**
 * Does this pull request implement the issue, rather than mention it? Linear
 * attaches every pull request whose body names an issue, so a passing
 * reference (#20371 naming JOV-7192) must not bind the issue's evidence. The
 * title, the jov-N branch, the merge-sync identifier marker, Summer's issue
 * bind, or a Linear closing keyword count; a bare mention or "Part of" does
 * not.
 *
 * @param {{ title?: string, body?: string, head?: { ref?: string } }} pull
 * @param {string} identifier
 * @returns {boolean}
 */
export function pullImplementsIssue(pull, identifier) {
  const match = /^JOV-(\d+)$/i.exec(identifier);
  if (!match) return false;
  const id = `JOV-${match[1]}`;
  const exact = `${id}(?!\\d)`;
  const title = String(pull?.title ?? '');
  const body = String(pull?.body ?? '');
  const branch = String(pull?.head?.ref ?? '');
  return (
    new RegExp(`\\b${exact}`, 'i').test(title) ||
    new RegExp(`(?:^|[^A-Za-z0-9])jov-${match[1]}(?!\\d)`, 'i').test(branch) ||
    new RegExp(`linear-issue-identifier:\\s*${exact}`, 'i').test(body) ||
    new RegExp(`<!--\\s*summer-issue-bind\\s*-->\\s*${exact}`, 'i').test(
      body
    ) ||
    new RegExp(
      `\\b(?:clos(?:e[sd]?|ing)|fix(?:e[sd]|ing)?|resolv(?:e[sd]?|ing)|complet(?:e[sd]?|ing))\\b:?\\s+(?:https://linear\\.app/\\S*?/issue/)?${exact}`,
      'i'
    ).test(body)
  );
}

/**
 * Merged pull requests in this repository that implement the issue, from
 * Linear's native attachments plus the merging pull request itself (whose
 * link the merge sync already proved).
 *
 * @param {{
 *   readonly github: GithubGet,
 *   readonly repository: string,
 *   readonly identifier: string,
 *   readonly attachmentUrls: readonly string[],
 *   readonly eventPull?: { number: number },
 * }} input
 * @returns {Promise<MergedPull[]>}
 */
export async function listMergedLinkedPulls(input) {
  const prefix = `https://github.com/${input.repository}/pull/`.toLowerCase();
  const numbers = new Set();
  if (input.eventPull && input.eventPull.number > 0) {
    numbers.add(input.eventPull.number);
  }
  for (const url of input.attachmentUrls) {
    if (!url.toLowerCase().startsWith(prefix)) continue;
    const number = Number(url.slice(prefix.length).split(/[/?#]/)[0]);
    if (Number.isSafeInteger(number) && number > 0) numbers.add(number);
  }
  const selected = [...numbers].sort((left, right) => right - left);
  if (selected.length > MAX_LINKED_PULLS) {
    throw new Error(
      `More than ${MAX_LINKED_PULLS} linked pull requests; the binding merge is ambiguous`
    );
  }
  /** @type {MergedPull[]} */
  const merged = [];
  for (const number of selected) {
    const { body } = await input.github(
      `repos/${input.repository}/pulls/${number}`
    );
    if (
      typeof body?.merged_at === 'string' &&
      /^[0-9a-f]{40}$/i.test(String(body?.merge_commit_sha ?? '')) &&
      body?.base?.ref === 'main' &&
      (number === input.eventPull?.number ||
        pullImplementsIssue(body, input.identifier))
    ) {
      merged.push({
        number,
        url: String(body.html_url ?? `${prefix}${number}`),
        mergeSha: String(body.merge_commit_sha).toLowerCase(),
        mergedAt: body.merged_at,
      });
    }
  }
  return merged;
}

/**
 * Every file the merged pull requests changed, renames included. Any unread
 * page makes the whole list unknown (`null`).
 *
 * @param {{
 *   readonly github: GithubGet,
 *   readonly repository: string,
 *   readonly pulls: readonly { number: number }[],
 * }} input
 * @returns {Promise<string[] | null>}
 */
export async function listMergedFiles(input) {
  const files = new Set();
  try {
    for (const pull of input.pulls) {
      let complete = false;
      for (let page = 1; page <= MAX_FILE_PAGES; page += 1) {
        const { body, link } = await input.github(
          `repos/${input.repository}/pulls/${pull.number}/files?per_page=100&page=${page}`
        );
        if (!Array.isArray(body)) return null;
        for (const file of body) {
          if (typeof file?.filename === 'string') files.add(file.filename);
          if (typeof file?.previous_filename === 'string') {
            files.add(file.previous_filename);
          }
        }
        if (!/rel="next"/i.test(link)) {
          complete = true;
          break;
        }
      }
      if (!complete) return null;
    }
  } catch {
    return null;
  }
  return [...files];
}

/**
 * The JOV-5937 risk receipt for the merged change: the existing deterministic
 * CI classifier over the merged files. Unknown files are unknown risk.
 *
 * @param {readonly string[] | null} files
 * @param {unknown} harnessManifest
 * @returns {RiskSummary | null}
 */
export function classifyMergedRisk(files, harnessManifest) {
  if (!harnessManifest || !files) return null;
  const classification = classifyCiRisk([...files], harnessManifest);
  if (classification.errors.length > 0) return null;
  return {
    riskLevel: classification.riskLevel,
    blocksUnattendedAutoMerge: classification.blocksUnattendedAutoMerge,
    matchedRules: classification.matchedRules.map(
      /** @param {{ id: string }} rule */ rule => rule.id
    ),
  };
}

/**
 * The exact-build UI evidence the JOV-7713 assurance matrix says these files
 * owe. Unknown files or an unreadable matrix are unknown (`null`), never "no
 * UI change".
 *
 * @param {readonly string[] | null} files
 * @param {unknown} assuranceMatrix
 */
export function mergedUiEvidence(files, assuranceMatrix) {
  if (!files || !assuranceMatrix || typeof assuranceMatrix !== 'object') {
    return null;
  }
  const rows =
    /** @type {{ rows?: { id?: string, ui?: { judgment?: string } }[] }} */ (
      assuranceMatrix
    ).rows;
  // The invariant registry is control-plane metadata. A queue/security entry
  // must not invalidate product UI taste merely because the shared file also
  // contains design invariants. Actual UI/detector paths remain authoritative.
  const productPaths = files.filter(path => path !== 'canon/invariants.jsonl');
  return uiEvidenceRequirements(assuranceMatrix, productPaths).map(entry => ({
    row: String(entry.row),
    failureClass: String(entry.failureClass),
    // A row without a judgment is machine-checked; taste is never assumed.
    judgment: String(
      rows?.find(row => row.id === entry.row)?.ui?.judgment ?? 'deterministic'
    ),
    targets: entry.targets.map(String),
  }));
}

/**
 * @param {string} name
 * @param {readonly { id?: string, name?: string }[]} states
 * @returns {string}
 */
export function selectStateId(name, states) {
  const match = (states ?? []).find(state => state?.name === name);
  return typeof match?.id === 'string' ? match.id : '';
}

/**
 * @typedef {{
 *   id: string,
 *   identifier: string,
 *   title?: string,
 *   labels: string[],
 *   description: string,
 *   reopenedAfterDone?: boolean,
 *   state: { id: string, name: string, type: string },
 *   states: { id?: string, name?: string, type?: string }[],
 *   commentRecords: { body: string, createdAt: string }[],
 *   attachmentUrls: string[],
 * }} LifecycleIssue
 * @typedef {{
 *   readStateId: (issueId: string) => Promise<string>,
 *   setState: (issueId: string, stateId: string) => Promise<string>,
 *   addComment: (issueId: string, body: string) => Promise<boolean>,
 *   readDescription: (issueId: string) => Promise<string>,
 *   setDescription: (issueId: string, description: string) => Promise<boolean>,
 * }} LinearPort
 */

/**
 * Evaluate one issue against current facts and apply at most one transition
 * plus one deduplicated status comment.
 *
 * @param {{
 *   readonly issue: LifecycleIssue,
 *   readonly holds: readonly string[],
 *   readonly parentReason: string,
 *   readonly github: GithubGet,
 *   readonly repository: string,
 *   readonly facts: ReturnType<typeof createProductionFacts>,
 *   readonly harnessManifest: unknown,
 *   readonly assuranceMatrix: unknown,
 *   readonly linear: LinearPort,
 *   readonly eventPull?: { number: number },
 *   readonly dryRun?: boolean,
 *   readonly now?: () => Date,
 *   readonly log: (message: string) => void,
 * }} ctx
 */
export async function reconcileValidation(ctx) {
  const { issue } = ctx;
  const merged = await listMergedLinkedPulls({
    github: ctx.github,
    repository: ctx.repository,
    identifier: issue.identifier,
    attachmentUrls: issue.attachmentUrls,
    eventPull: ctx.eventPull,
  });
  const escapedDefect = evaluateEscapedDefectClosure({
    ...issue,
    comments: issue.commentRecords,
  });
  const files = await listMergedFiles({
    github: ctx.github,
    repository: ctx.repository,
    pulls: merged,
  });
  const manifest = deriveValidationManifest({
    issue,
    mergedPulls: merged,
    risk: classifyMergedRisk(files, ctx.harnessManifest),
    parentReason: ctx.parentReason,
    escapedDefect: escapedDefect.applicable,
    uiEvidence: mergedUiEvidence(files, ctx.assuranceMatrix),
  });
  if (!manifest) {
    ctx.log(
      `${issue.identifier} has no merged ${ctx.repository} pull request on main; its deployment is not computed here, so it stays in ${issue.state.name}`
    );
    return {
      action: 'skip',
      identifier: issue.identifier,
      target: null,
      comment: '',
    };
  }

  const served = await ctx.facts.servedGeneration();
  /** @type {DeploymentFact} */
  let deployment = served;
  if (served.status !== 'unknown' && served.sha) {
    if (!(await ctx.facts.contains(manifest.bindingSha, served.sha))) {
      deployment = {
        status: 'pending',
        sha: served.sha,
        detail: `served generation ${served.sha.slice(0, 12)} does not contain the merge yet`,
      };
    }
  }

  const receipts = [];
  for (const receipt of [
    ...parseValidationReceipts(issue.commentRecords, issue.identifier),
    ...tasteReceiptsFromResults(
      issue.description,
      issue.commentRecords,
      issue.identifier
    ),
  ]) {
    const containsBinding = await ctx.facts.contains(
      manifest.bindingSha,
      receipt.sha
    );
    const verifiedArtifact =
      containsBinding && receipt.status === 'pass'
        ? await ctx.facts.hasVerifiedMarker(receipt.sha)
        : false;
    receipts.push({ ...receipt, containsBinding, verifiedArtifact });
  }

  let escapedDefectResult;
  if (escapedDefect.applicable) {
    const deployedSha = String(
      escapedDefect.evidence?.productRepair?.deployedBuild?.sha ?? ''
    ).toLowerCase();
    const errors = [...escapedDefect.errors];
    if (escapedDefect.ok && /^[0-9a-f]{40}$/.test(deployedSha)) {
      if (!(await ctx.facts.contains(manifest.bindingSha, deployedSha))) {
        errors.push(
          'productRepair.deployedBuild.sha does not contain the binding merge'
        );
      } else if (!(await ctx.facts.hasVerifiedMarker(deployedSha))) {
        errors.push(
          'productRepair.deployedBuild.sha is not a verified production generation'
        );
      }
    }
    escapedDefectResult = { ok: errors.length === 0, errors };
  }

  const decision = decideValidationTransition({
    state: issue.state,
    manifest,
    holds: ctx.holds,
    deployment,
    receipts,
    escapedDefect: escapedDefectResult,
  });
  const statusKey = lifecycleStatusKey({
    target: decision.target,
    manifest,
    missing: decision.missing,
    failing: decision.failing,
    deploymentSha: deployment.sha,
  });
  const comment = formatLifecycleComment({
    identifier: issue.identifier,
    from: issue.state.name,
    target: decision.target,
    manifest,
    missing: decision.missing,
    explanation: decision.explanation,
    statusKey,
    deploymentSha:
      deployment.status === 'verified' ? deployment.sha : undefined,
  });
  const move = Boolean(decision.target && decision.target !== issue.state.name);
  const result = {
    action: move ? 'moved' : decision.target ? 'kept' : 'hold',
    identifier: issue.identifier,
    target: decision.target,
    comment,
  };
  if (ctx.dryRun) {
    ctx.log(
      `[dry run] ${issue.identifier}: ${issue.state.name} -> ${decision.target ?? 'unchanged'}\n${comment}`
    );
    return result;
  }
  if (move) {
    const stateId = selectStateId(String(decision.target), issue.states);
    if (!stateId) {
      throw new Error(
        `Linear team has no ${decision.target} state for ${issue.identifier}`
      );
    }
    // Another writer may have moved the issue while facts were read. Apply
    // only from the state this decision was made against.
    if ((await ctx.linear.readStateId(issue.id)) !== issue.state.id) {
      ctx.log(`${issue.identifier} moved during evaluation; no write`);
      return {
        action: 'skip',
        identifier: issue.identifier,
        target: null,
        comment: '',
      };
    }
    if ((await ctx.linear.setState(issue.id, stateId)) !== decision.target) {
      throw new Error(
        `Linear refused to move ${issue.identifier} to ${decision.target}`
      );
    }
  }
  const terminal = ['completed', 'canceled'].includes(issue.state.type);
  if (
    !terminal &&
    latestLifecycleStatusKey(issue.commentRecords) !== statusKey &&
    !(await ctx.linear.addComment(issue.id, comment))
  ) {
    throw new Error(
      `Linear refused the lifecycle comment on ${issue.identifier}`
    );
  }
  if (
    decision.target === 'Validating' &&
    decision.missing.includes('founder-taste') &&
    deployment.status === 'verified' &&
    deployment.sha
  ) {
    await fileTasteOrder(ctx, manifest, deployment.sha);
  }
  ctx.log(
    move
      ? `Moved ${issue.identifier} from ${issue.state.name} to ${decision.target}`
      : `Kept ${issue.identifier} in ${issue.state.name}`
  );
  return result;
}

/**
 * Ask the founder through Ovie (JOV-7739) once per binding merge: append a
 * sealed taste work order to the issue body, where Summer reads it. The body
 * is re-read first so a concurrent edit or an earlier filing is kept.
 *
 * @param {Parameters<typeof reconcileValidation>[0]} ctx
 * @param {import('./validation-lifecycle.mjs').ValidationManifest} manifest
 * @param {string} deploymentSha
 */
async function fileTasteOrder(ctx, manifest, deploymentSha) {
  const { issue } = ctx;
  const orderId = tasteOrderId(issue.identifier, manifest.bindingSha);
  const filed = (/** @type {string} */ body) =>
    readTasteOrders(body, issue.identifier).some(
      entry => entry.order.orderId === orderId
    );
  if (filed(issue.description)) return;
  const current = await ctx.linear.readDescription(issue.id);
  if (filed(current)) return;
  const order = founderTasteOrder({
    identifier: issue.identifier,
    issueTitle: issue.title,
    issueUrl: `https://linear.app/jovie/issue/${issue.identifier}`,
    bindingSha: manifest.bindingSha,
    bindingPull: manifest.bindingPull,
    deploymentSha,
    productionUrl: 'https://jov.ie',
    uiEvidence: (manifest.uiEvidence ?? []).filter(
      entry => entry.judgment === 'taste' || entry.judgment === 'mixed'
    ),
    reason:
      manifest.required.find(entry => entry.kind === 'founder-taste')?.reason ??
      'a founder taste receipt is required',
    now: (ctx.now ?? (() => new Date()))().toISOString(),
  });
  const body = `${current.trimEnd()}\n\n### Founder taste (JOV-7759)\n\n${renderTasteOrder(order)}\n`;
  if (!(await ctx.linear.setDescription(issue.id, body))) {
    throw new Error(
      `Linear refused the founder taste order on ${issue.identifier}`
    );
  }
  ctx.log(`Filed founder taste order ${orderId} for ${deploymentSha}`);
}
