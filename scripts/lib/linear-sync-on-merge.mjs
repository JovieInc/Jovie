#!/usr/bin/env node
/**
 * Project merged pull requests onto the Linear validation lifecycle
 * (JOV-7694): Merging until a verified production generation contains the
 * merge, Validating while required receipts are missing, Rework on a required
 * failure, and Done only when every required receipt passes. Merge alone
 * never marks an issue Done.
 *
 * Linked means a linear-issue-id / linear-issue-identifier marker in the PR
 * body, a jov-NNNN branch reference, the identifier in the title, or a native
 * Linear attachment. Commissioning and parent issues enter the lifecycle but
 * need an outcome receipt (JOV-7300). Invariant consumer: JOV-INV-041.
 */

import {
  appendFileSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve as resolvePath } from 'node:path';
import { pathToFileURL } from 'node:url';
import { deprecationCheckGreen } from './deprecation-observation.mjs';
import { GREEN_MARKER } from './remediation-signal.mjs';
import {
  formatValidationReceipt,
  LIFECYCLE_STATES,
} from './validation-lifecycle.mjs';
import {
  boundGithubCache,
  createProductionFacts,
  fetchWithRetry,
  githubClient,
  githubStatusError,
  headerRetryMs,
  immutableGithubCache,
  rateLimitWaitMs,
  reconcileValidation,
} from './validation-sync.mjs';

/**
 * The three classifiers merge-mode needs from github-installation-quota.mjs.
 * The full module also owns Scorecard waits; this writer only classifies.
 * @typedef {{
 *   failureDisposition: (
 *     label: string,
 *     error: unknown,
 *   ) => { code: number, log: string, softFailed: boolean },
 *   installationQuotaLog: (label: string) => string,
 *   isInstallationQuota403: (text: unknown, status?: number | null) => boolean,
 * }} InstallationQuotaClassifier
 */

/**
 * pull_request merge runs use the workflow file from the PR merge ref and
 * then check out main. A merge ref from before this module was added omits
 * it from sparse-checkout. A static import then dies with ERR_MODULE_NOT_FOUND
 * before any lifecycle write. Load it when the checkout has it. When it does
 * not, installation 403s stay fatal: this is not a skip and not exit 0.
 * Any other load error still throws.
 * @returns {Promise<InstallationQuotaClassifier>}
 */
async function loadInstallationQuotaClassifier() {
  try {
    return await import('./github-installation-quota.mjs');
  } catch (error) {
    const code =
      error && typeof error === 'object' && 'code' in error
        ? String(error.code)
        : '';
    if (code !== 'ERR_MODULE_NOT_FOUND') throw error;
    console.error(
      'Linear Sync: scripts/lib/github-installation-quota.mjs is absent from this sparse checkout. Installation 403s stay fatal. This is not a successful skip.'
    );
    return {
      failureDisposition(_label, failure) {
        const stderr =
          failure && typeof failure === 'object' && 'stderr' in failure
            ? String(/** @type {{ stderr?: unknown }} */ (failure).stderr ?? '')
            : '';
        const message =
          failure instanceof Error ? failure.message : String(failure ?? '');
        const text = `${stderr}\n${message}`.trim();
        return {
          code: 1,
          log: text || 'unknown failure',
          softFailed: false,
        };
      },
      installationQuotaLog(label) {
        return `Linear Sync: installation-quota classifier unavailable for ${label}; installation 403s stay fatal`;
      },
      isInstallationQuota403() {
        return false;
      },
    };
  }
}

const installationQuota = await loadInstallationQuotaClassifier();

/** True only when the checked-out classifier recognized an installation 403. */
export const installationQuotaClassifierReady =
  installationQuota.isInstallationQuota403(
    'API rate limit exceeded for installation ID 1'
  ) === true;

export const {
  failureDisposition,
  installationQuotaLog,
  isInstallationQuota403,
} = installationQuota;

export const LINEAR_API = 'https://api.linear.app/graphql';
export const COMMISSIONING_PARENT_ALLOWLIST = new Set([
  'JOV-5853',
  // Liveness owner: merge is explicitly not exact-runtime or recurrence proof.
  'JOV-6004',
]);

const IDENTIFIER_RE = /^JOV-(\d+)$/i;
const COMMISSIONING_LABEL_RE = /commission/i;
const PARENT_LABEL_RE = /^(parent|epic|type:epic)$/i;
const MAX_OPEN_PR_PAGES = 20;
export const SWEEP_CURSOR_SCHEMA = 1;
export const SWEEP_BATCH_SIZE = 4;
const SWEEP_CURSOR_FILE = 'cursor.json';

/** @type {(ms: number) => Promise<void>} */
let sleepFn = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * @param {string | undefined} dir
 * @returns {{ nextIdentifier: string } | null}
 */
export function readSweepCursor(dir) {
  if (!dir) return null;
  try {
    const raw = JSON.parse(readFileSync(join(dir, SWEEP_CURSOR_FILE), 'utf8'));
    if (raw?.schema !== SWEEP_CURSOR_SCHEMA) return null;
    const nextIdentifier = String(raw.nextIdentifier ?? '').toUpperCase();
    if (nextIdentifier && !IDENTIFIER_RE.test(nextIdentifier)) return null;
    return { nextIdentifier };
  } catch {
    return null;
  }
}

/**
 * @param {string | undefined} dir
 * @param {string} nextIdentifier
 */
export function writeSweepCursor(dir, nextIdentifier) {
  if (!dir) return;
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, SWEEP_CURSOR_FILE),
    `${JSON.stringify({
      schema: SWEEP_CURSOR_SCHEMA,
      nextIdentifier: nextIdentifier || '',
      savedAt: new Date().toISOString(),
    })}\n`
  );
}

/**
 * Subset of fetch that production `globalThis.fetch` and the regression
 * doubles both satisfy. checkJs rejects a test double typed as `typeof fetch`
 * when it returns a plain envelope instead of `Response`.
 *
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
 */

/**
 * @param {unknown} label
 * @returns {string}
 */
function labelName(label) {
  if (typeof label === 'string') return label;
  if (!label || typeof label !== 'object') return '';
  const name = Reflect.get(label, 'name');
  return typeof name === 'string' ? name : '';
}

/**
 * @param {unknown} value
 * @returns {string}
 */
export function linearIdentifierFromText(value) {
  const match = /(?:^|[^A-Za-z0-9])jov-(\d+)(?!\d)/i.exec(String(value ?? ''));
  return match ? `JOV-${match[1]}` : '';
}

/**
 * @param {{
 *   readonly body?: string,
 *   readonly headRef?: string,
 * }} input
 * @returns {{ identifier: string, issueId: string }}
 */
export function extractMergeIssueRef(input = {}) {
  const body = String(input.body ?? '');
  const identifierMarker =
    /linear-issue-identifier:\s*([A-Za-z0-9-]+)/i.exec(body)?.[1] ?? '';
  const idMarker = /linear-issue-id:\s*([A-Za-z0-9-]+)/i.exec(body)?.[1] ?? '';
  const summerIdentifier =
    /<!--\s*summer-issue-bind\s*-->\s*(JOV-\d+)(?![A-Za-z0-9-])/i.exec(
      body
    )?.[1] ?? '';
  const identifier = IDENTIFIER_RE.test(identifierMarker)
    ? identifierMarker.toUpperCase()
    : IDENTIFIER_RE.test(idMarker)
      ? idMarker.toUpperCase()
      : summerIdentifier
        ? summerIdentifier.toUpperCase()
        : linearIdentifierFromText(input.headRef);
  const issueId =
    idMarker && !IDENTIFIER_RE.test(idMarker) ? idMarker : identifier;
  return { identifier, issueId };
}

/**
 * @param {unknown} pull
 * @returns {{
 *   number: number,
 *   title: string,
 *   body: string,
 *   state: string,
 *   draft: boolean,
 *   headRef: string,
 *   url: string,
 * }}
 */
export function normalizePullRequest(pull) {
  const record =
    pull && typeof pull === 'object'
      ? /** @type {Record<string, unknown>} */ (pull)
      : {};
  const head =
    record.head && typeof record.head === 'object'
      ? /** @type {{ ref?: unknown }} */ (record.head)
      : {};
  const number = Number(record.number);
  return {
    number: Number.isInteger(number) ? number : 0,
    title: typeof record.title === 'string' ? record.title : '',
    body: typeof record.body === 'string' ? record.body : '',
    state: String(record.state ?? '').toLowerCase(),
    draft: record.draft === true || record.isDraft === true,
    headRef:
      typeof head.ref === 'string'
        ? head.ref
        : typeof record.headRef === 'string'
          ? record.headRef
          : typeof record.headRefName === 'string'
            ? record.headRefName
            : '',
    url:
      typeof record.html_url === 'string'
        ? record.html_url
        : typeof record.url === 'string'
          ? record.url
          : '',
  };
}

/**
 * @param {{ readonly state?: string, readonly draft?: boolean }} pull
 * @returns {boolean}
 */
export function isOpenOrDraft(pull) {
  const state = String(pull.state ?? '').toLowerCase();
  if (state === 'closed' || state === 'merged') return false;
  if (state === 'open') return true;
  return pull.draft === true;
}

/**
 * @param {{
 *   readonly title?: string,
 *   readonly body?: string,
 *   readonly headRef?: string,
 * }} pull
 * @param {{ readonly identifier?: string, readonly issueId?: string }} issue
 * @returns {boolean}
 */
export function pullRequestLinksIssue(pull, issue) {
  const identifier = String(issue.identifier ?? '').toUpperCase();
  const issueId = String(issue.issueId ?? '');
  const numberMatch = IDENTIFIER_RE.exec(identifier);
  const number = numberMatch ? numberMatch[1] : '';
  const title = pull.title ?? '';
  const body = pull.body ?? '';
  const branch = pull.headRef ?? '';
  if (identifier && new RegExp(`\\b${identifier}\\b`, 'i').test(title)) {
    return true;
  }
  if (
    number &&
    new RegExp(`(?:^|[^A-Za-z0-9])jov-${number}(?!\\d)`, 'i').test(branch)
  ) {
    return true;
  }
  const idMarkers = [
    ...body.matchAll(/linear-issue-id:\s*([A-Za-z0-9-]+)/gi),
  ].map(match => match[1]);
  const identifierMarkers = [
    ...body.matchAll(/linear-issue-identifier:\s*([A-Za-z0-9-]+)/gi),
  ].map(match => match[1].toUpperCase());
  if (issueId && idMarkers.includes(issueId)) return true;
  if (identifier && identifierMarkers.includes(identifier)) return true;
  if (identifier && extractMergeIssueRef({ body }).identifier === identifier)
    return true;
  return idMarkers.some(marker => marker.toUpperCase() === identifier);
}

/**
 * @param {unknown} issue
 * @returns {{
 *   id: string,
 *   identifier: string,
 *   title: string,
 *   description: string,
 *   labels: string[],
 *   description: string,
 *   comments: string[],
 *   children: string[],
 *   hasChildren: boolean,
 *   acceptanceMetadataVerified: boolean,
 *   states: { id?: string, name?: string, type?: string }[],
 * }}
 */
export function readIssueSnapshot(issue) {
  const record =
    issue && typeof issue === 'object'
      ? /** @type {Record<string, unknown>} */ (issue)
      : {};
  const labelNodes = Array.isArray(record.labels)
    ? record.labels
    : record.labels &&
        typeof record.labels === 'object' &&
        Array.isArray(/** @type {{ nodes?: unknown }} */ (record.labels).nodes)
      ? /** @type {{ nodes: unknown[] }} */ (record.labels).nodes
      : [];
  const childNodes = Array.isArray(record.children)
    ? record.children
    : record.children &&
        typeof record.children === 'object' &&
        Array.isArray(
          /** @type {{ nodes?: unknown }} */ (record.children).nodes
        )
      ? /** @type {{ nodes: unknown[] }} */ (record.children).nodes
      : [];
  const commentNodes = Array.isArray(record.comments)
    ? record.comments
    : record.comments &&
        typeof record.comments === 'object' &&
        Array.isArray(
          /** @type {{ nodes?: unknown }} */ (record.comments).nodes
        )
      ? /** @type {{ nodes: unknown[] }} */ (record.comments).nodes
      : [];
  const team =
    record.team && typeof record.team === 'object'
      ? /** @type {{ states?: { nodes?: unknown } }} */ (record.team)
      : {};
  const states = Array.isArray(team.states?.nodes) ? team.states.nodes : [];
  const children = childNodes
    .map(child => {
      if (typeof child === 'string') return child.toUpperCase();
      if (!child || typeof child !== 'object') return '';
      const identifier = Reflect.get(child, 'identifier');
      return typeof identifier === 'string' ? identifier.toUpperCase() : '';
    })
    .filter(identifier => IDENTIFIER_RE.test(identifier));
  return {
    id: typeof record.id === 'string' ? record.id : '',
    identifier:
      typeof record.identifier === 'string'
        ? record.identifier.toUpperCase()
        : '',
    title: typeof record.title === 'string' ? record.title : '',
    description:
      typeof record.description === 'string' ? record.description : '',
    labels: labelNodes.map(labelName).filter(Boolean),
    comments: commentNodes
      .map(comment => {
        if (typeof comment === 'string') return comment;
        if (!comment || typeof comment !== 'object') return '';
        const body = Reflect.get(comment, 'body');
        return typeof body === 'string' ? body : '';
      })
      .filter(Boolean),
    children,
    hasChildren: childNodes.length > 0,
    acceptanceMetadataVerified:
      typeof record.title === 'string' &&
      (record.description === null || typeof record.description === 'string') &&
      Array.isArray(Reflect.get(Object(record.children), 'nodes')) &&
      Array.isArray(Reflect.get(Object(record.labels), 'nodes')) &&
      labelNodes.every(
        label =>
          label &&
          typeof label === 'object' &&
          typeof Reflect.get(label, 'name') === 'string'
      ),
    states: states.filter(state => state && typeof state === 'object'),
  };
}

/**
 * @param {{
 *   readonly identifier?: string,
 *   readonly title?: string,
 *   readonly description?: string,
 *   readonly labels?: readonly string[],
 *   readonly children?: readonly string[],
 *   readonly hasChildren?: boolean,
 * }} issue
 * @param {ReadonlySet<string>} [allowlist]
 * @returns {string}
 */
export function parentHoldReason(
  issue,
  allowlist = COMMISSIONING_PARENT_ALLOWLIST
) {
  const identifier = String(issue.identifier ?? '').toUpperCase();
  const signals = [];
  if (
    /^(?:codex\s+)?(?:goal|epic|commission(?:ing)?)(?:\s|:)/i.test(
      issue.title ?? ''
    ) ||
    /^\s*\/goal(?:\s|$)/im.test(issue.description ?? '')
  )
    signals.push('goal or commissioning acceptance');
  if (identifier && allowlist.has(identifier)) signals.push('allowlist');
  const labels = (issue.labels ?? []).filter(
    name => COMMISSIONING_LABEL_RE.test(name) || PARENT_LABEL_RE.test(name)
  );
  if (labels.length > 0) signals.push(`label ${labels.join(', ')}`);
  const children = issue.children ?? [];
  if (issue.hasChildren || children.length > 0) {
    signals.push(
      children.length > 0
        ? `sub-issues ${children.slice(0, 10).join(', ')}`
        : 'sub-issues present'
    );
  }
  if (signals.length === 0) return '';
  return `${identifier} is a commissioning or parent issue (${signals.join('; ')}) and stays open when a child pull request merges.`;
}

/**
 * @param {readonly { number: number, draft?: boolean }[]} pulls
 * @returns {string}
 */
function formatBlockingPulls(pulls) {
  const shown = pulls
    .slice(0, 20)
    .map(pull => `#${pull.number}${pull.draft ? ' (draft)' : ''}`);
  const extra = pulls.length > 20 ? ` and ${pulls.length - 20} more` : '';
  return `Linked pull requests still open or draft: ${shown.join(', ')}${extra}.`;
}

/**
 * @param {string | null | undefined} header
 * @returns {string}
 */
export function nextLink(header) {
  if (!header) return '';
  for (const part of header.split(',')) {
    const match = /<([^>]+)>;\s*rel="next"/i.exec(part);
    if (match) return match[1];
  }
  return '';
}

/**
 * Reasons the lifecycle must not move the issue at all. Commissioning and
 * parent acceptance no longer hold here: they enter the lifecycle and stay
 * out of Done until an outcome receipt passes.
 *
 * @param {{
 *   readonly issue: {
 *     readonly id?: string,
 *     readonly identifier?: string,
 *     readonly labels?: readonly string[],
 *     readonly openChildren?: readonly string[],
 *     readonly acceptanceMetadataVerified?: boolean,
 *   },
 *   readonly pullRequests: readonly object[],
 *   readonly mergingNumber?: number,
 *   readonly scanComplete?: boolean,
 *   readonly checkGreen?: boolean,
 * }} input
 * @returns {{ holds: string[], blockingNumbers: number[] }}
 */
export function lifecycleHolds(input) {
  const identifier = String(input.issue.identifier ?? '').toUpperCase();
  const mergingNumber = Number(input.mergingNumber ?? 0);
  const blocking = input.pullRequests
    .map(normalizePullRequest)
    .filter(pull => pull.number > 0 && pull.number !== mergingNumber)
    .filter(isOpenOrDraft)
    .filter(pull =>
      pullRequestLinksIssue(pull, {
        identifier,
        issueId: input.issue.id,
      })
    )
    .sort((left, right) => left.number - right.number);
  const holds = [];
  if (input.issue.acceptanceMetadataVerified === false) {
    holds.push('Canonical acceptance metadata is unverified.');
  }
  if (blocking.length > 0) holds.push(formatBlockingPulls(blocking));
  if (input.scanComplete === false) {
    holds.push(
      'The open pull request scan stopped before the last page, so the issue was left in place.'
    );
  }
  const openChildren = input.issue.openChildren ?? [];
  if (openChildren.length > 0) {
    holds.push(
      `Sub-issues are still open: ${openChildren.slice(0, 10).join(', ')}.`
    );
  }
  const remediationLabeled = (input.issue.labels ?? []).some(label =>
    String(label).startsWith('remediation:')
  );
  if (remediationLabeled && input.checkGreen !== true) {
    holds.push(
      'Fingerprinted remediation issues stay open while the check is red.'
    );
  }
  return { holds, blockingNumbers: blocking.map(pull => pull.number) };
}

/**
 * @param {HttpFetch} fetchImpl
 * @param {string} apiKey
 * @param {string} query
 * @param {Record<string, unknown>} variables
 * @returns {Promise<Record<string, any>>}
 */
async function linearGraphql(fetchImpl, apiKey, query, variables) {
  // Bounded retry for transient Linear upstream failures (JOV-8012): a
  // 503/502/504 from Linear used to fail the whole sweep even though the
  // next scheduled run converged. Retry the transport statuses and a short
  // shared-key rate limit. A reset beyond the sweep budget throws so the
  // caller can persist the cursor instead of sleeping out the hour.
  const maxAttempts = 4;
  /** @type {Error | null} */
  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const response = await fetchWithRetry(fetchImpl, LINEAR_API, {
      method: 'POST',
      headers: {
        Authorization: apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, variables }),
    });
    if (response.ok) {
      const payload =
        /** @type {{ errors?: unknown, data?: Record<string, any> }} */ (
          await response.json()
        );
      if (Array.isArray(payload.errors) && payload.errors.length > 0) {
        const errors = payload.errors;
        const limited = errors.some(
          error =>
            error &&
            typeof error === 'object' &&
            'extensions' in error &&
            /** @type {{ extensions?: { code?: string } }} */ (error).extensions
              ?.code === 'RATELIMITED'
        );
        if (!limited) {
          throw new Error(
            errors
              .map(error =>
                error && typeof error === 'object' && 'message' in error
                  ? String(error.message)
                  : 'Linear request failed'
              )
              .join('; ')
          );
        }
        lastError = Object.assign(
          new Error(`Linear rate limited (HTTP ${response.status})`),
          { rateLimited: true, retryAfterMs: headerRetryMs(response.headers) }
        );
      } else {
        return payload.data ?? {};
      }
    } else {
      // Linear answers a spent rate limit with HTTP 400 and RATELIMITED. The
      // lifecycle key is shared with Summer and agents, so name it plainly.
      /** @type {any} */
      const body = await response.json().catch(() => null);
      const errors = Array.isArray(body?.errors) ? body.errors : [];
      const limited =
        response.status === 429 ||
        errors.some(
          (/** @type {any} */ error) =>
            error?.extensions?.code === 'RATELIMITED'
        );
      const detail = errors
        .map((/** @type {any} */ error) => String(error?.message ?? ''))
        .filter(Boolean)
        .join('; ');
      lastError = Object.assign(
        new Error(
          limited
            ? `Linear rate limited (HTTP ${response.status})`
            : `Linear HTTP ${response.status}${detail ? `: ${detail}` : ''}`
        ),
        {
          rateLimited: limited,
          retryAfterMs: limited ? headerRetryMs(response.headers) : 0,
        }
      );
    }
    const flagged =
      /** @type {{ rateLimited?: boolean, retryAfterMs?: number }} */ (
        lastError
      );
    const wait = flagged.rateLimited
      ? rateLimitWaitMs(flagged.retryAfterMs ?? 0, attempt, maxAttempts)
      : response.status === 429 || response.status >= 500
        ? Math.min(4_000, 2 ** (attempt - 1) * 250)
        : null;
    if (wait == null || attempt === maxAttempts) throw lastError;
    await sleepFn(wait);
  }
  throw lastError ?? new Error('Linear request failed');
}

/**
 * @param {{
 *   readonly fetchImpl: HttpFetch,
 *   readonly token: string,
 *   readonly repository: string,
 *   readonly maxPages?: number,
 * }} input
 */
export async function listOpenPullRequests(input) {
  const maxPages = input.maxPages ?? MAX_OPEN_PR_PAGES;
  const maxAttempts = 4;
  /** @type {ReturnType<typeof normalizePullRequest>[]} */
  const pulls = [];
  let url = `https://api.github.com/repos/${input.repository}/pulls?state=open&per_page=100&page=1`;
  for (let page = 0; page < maxPages; page += 1) {
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const response = await input.fetchImpl(url, {
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${input.token}`,
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'jovie-linear-sync-on-merge',
        },
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        const error = githubStatusError(
          response.status,
          response.headers,
          body,
          `repos/${input.repository}/pulls?state=open`
        );
        const wait = error.rateLimited
          ? rateLimitWaitMs(error.retryAfterMs, attempt, maxAttempts)
          : null;
        if (wait == null || attempt === maxAttempts) throw error;
        await sleepFn(wait);
        continue;
      }
      const batch = await response.json();
      if (!Array.isArray(batch)) {
        throw new Error('GitHub pulls response was not a list');
      }
      pulls.push(...batch.map(normalizePullRequest));
      const next = nextLink(response.headers?.get?.('link') ?? '');
      if (!next) return { pulls, complete: true };
      url = next;
      break;
    }
  }
  return { pulls, complete: false };
}

const ISSUE_FIELDS = `
    id
    updatedAt
    identifier
    title
    description
    state { id name type }
    labels(first: 50) { nodes { name } }
    comments(first: 100) {
      nodes { body createdAt }
      pageInfo { hasNextPage endCursor }
    }
    children(first: 50) {
      nodes { identifier completedAt canceledAt state { type } }
      pageInfo { hasNextPage endCursor }
    }
    inverseRelations(first: 50) {
      nodes { id type issue { id identifier state { id name type } } }
      pageInfo { hasNextPage endCursor }
    }
    attachments(first: 50) { nodes { url } }
    history(first: 100) {
      nodes { createdAt fromState { type } toState { type } }
      pageInfo { hasNextPage endCursor }
    }
    team { states { nodes { id name type } } }`;

const ISSUE_QUERY = `query IssueLifecycle($issueId: String!) {
  issue(id: $issueId) {${ISSUE_FIELDS}
  }
}`;

const COMMENTS_PAGE_QUERY = `query IssueLifecycleComments($issueId: String!, $after: String!) {
  issue(id: $issueId) {
    comments(first: 100, after: $after) {
      nodes { body createdAt }
      pageInfo { hasNextPage endCursor }
    }
  }
}`;

const CHILDREN_PAGE_QUERY = `query IssueLifecycleChildren($issueId: String!, $after: String!) {
  issue(id: $issueId) {
    children(first: 50, after: $after) {
      nodes { identifier completedAt canceledAt state { type } }
      pageInfo { hasNextPage endCursor }
    }
  }
}`;

const BLOCKERS_PAGE_QUERY = `query IssueLifecycleBlockers($issueId: String!, $after: String!) {
  issue(id: $issueId) {
    inverseRelations(first: 50, after: $after) {
      nodes { id type issue { id identifier state { id name type } } }
      pageInfo { hasNextPage endCursor }
    }
  }
}`;

const ISSUE_STATE_QUERY = `query IssueLifecycleState($issueId: String!) {
  issue(id: $issueId) { id state { id name } }
}`;

const HISTORY_PAGE_QUERY = `query IssueLifecycleHistory($issueId: String!, $after: String!) {
  issue(id: $issueId) {
    history(first: 100, after: $after) {
      nodes { createdAt fromState { type } toState { type } }
      pageInfo { hasNextPage endCursor }
    }
  }
}`;

const SWEEP_QUERY = `query LifecycleSweep($states: [String!]!, $after: String) {
  issues(
    first: 50
    after: $after
    filter: { team: { key: { eq: "JOV" } }, state: { name: { in: $states } } }
  ) {
    nodes { identifier updatedAt state { name } attachments(first: 50) { nodes { url } } children(first: 1) { nodes { identifier } } labels(first: 50) { nodes { name } } }
    pageInfo { hasNextPage endCursor }
  }
}`;

const MAX_COMMENT_PAGES = 10;
const MAX_CHILD_PAGES = 20;
const MAX_BLOCKER_PAGES = 20;
const MAX_SWEEP_PAGES = 10;
const CI_HARNESS_MANIFEST = '.github/ci-harness/manifest.json';
const ASSURANCE_MATRIX = 'scripts/invariants/assurance-matrix.json';

/**
 * Read the issue with every comment in server order. The escaped-defect
 * parser and receipt reader take the latest marker, so order matters.
 *
 * @param {HttpFetch} fetchImpl
 * @param {string} apiKey
 * @param {string} lookupId
 */
async function readLifecycleIssue(fetchImpl, apiKey, lookupId) {
  const data = await linearGraphql(fetchImpl, apiKey, ISSUE_QUERY, {
    issueId: lookupId,
  });
  const raw = data.issue;
  if (!raw || typeof raw !== 'object') return null;
  return materializeLifecycleIssue(fetchImpl, apiKey, raw);
}

/**
 * One Linear request for several issue records. Alias batching keeps a sweep
 * inside the shared request budget; a single id keeps the original query so
 * existing callers stay unchanged. Pagination and delivery checks happen later,
 * per issue, so one bounded history read is not fetched twice.
 *
 * @param {HttpFetch} fetchImpl
 * @param {string} apiKey
 * @param {readonly string[]} lookupIds
 * @returns {Promise<(Record<string, any> | null)[]>}
 */
async function fetchLifecycleRaws(fetchImpl, apiKey, lookupIds) {
  if (lookupIds.length === 0) return [];
  if (lookupIds.length === 1) {
    const data = await linearGraphql(fetchImpl, apiKey, ISSUE_QUERY, {
      issueId: lookupIds[0],
    });
    const raw = data.issue;
    return [raw && typeof raw === 'object' ? raw : null];
  }
  /** @type {Record<string, string>} */
  const variables = {};
  const selections = lookupIds.map((id, index) => {
    variables[`id${index}`] = id;
    return `i${index}: issue(id: $id${index}) {${ISSUE_FIELDS}
  }`;
  });
  const decls = lookupIds.map((_, index) => `$id${index}: String!`).join(', ');
  const data = await linearGraphql(
    fetchImpl,
    apiKey,
    `query LifecycleIssueBatch(${decls}) {
${selections.join('\n')}
}`,
    variables
  );
  return lookupIds.map((_, index) => {
    const raw = data[`i${index}`];
    return raw && typeof raw === 'object' ? raw : null;
  });
}

/**
 * @param {HttpFetch} fetchImpl
 * @param {string} apiKey
 * @param {Record<string, any>} raw
 */
async function materializeLifecycleIssue(fetchImpl, apiKey, raw) {
  // Incoming `blocks` edges name this issue's prerequisites. Outgoing
  // edges and related issues do not make this issue dependent on them.
  const blockingIssues = [];
  let blockerPage = raw.inverseRelations;
  const blockerCursors = new Set();
  const blockerIds = new Set();
  for (let page = 0; ; page += 1) {
    if (
      !Array.isArray(blockerPage?.nodes) ||
      typeof blockerPage?.pageInfo?.hasNextPage !== 'boolean'
    ) {
      throw new Error(
        `Blocking dependency metadata for ${raw.identifier} is incomplete`
      );
    }
    for (const relation of blockerPage.nodes) {
      if (
        typeof relation?.id !== 'string' ||
        !relation.id ||
        blockerIds.has(relation.id) ||
        typeof relation.type !== 'string' ||
        !relation.type
      ) {
        throw new Error(
          `Blocking dependency metadata for ${raw.identifier} is incomplete`
        );
      }
      blockerIds.add(relation.id);
      if (relation.type !== 'blocks') continue;
      const prerequisite = relation.issue;
      if (
        typeof prerequisite?.id !== 'string' ||
        !prerequisite.id ||
        !IDENTIFIER_RE.test(String(prerequisite.identifier ?? '')) ||
        typeof prerequisite.state?.id !== 'string' ||
        !prerequisite.state.id ||
        typeof prerequisite.state.name !== 'string' ||
        !prerequisite.state.name ||
        typeof prerequisite.state.type !== 'string' ||
        !prerequisite.state.type
      ) {
        throw new Error(
          `Blocking dependency state for ${raw.identifier} is incomplete`
        );
      }
      blockingIssues.push({
        relationId: relation.id,
        id: prerequisite.id,
        identifier: prerequisite.identifier,
        state: {
          id: prerequisite.state.id,
          name: prerequisite.state.name,
          type: prerequisite.state.type,
        },
      });
    }
    if (!blockerPage.pageInfo.hasNextPage) break;
    const after = blockerPage.pageInfo.endCursor;
    if (
      page >= MAX_BLOCKER_PAGES - 1 ||
      typeof after !== 'string' ||
      !after ||
      blockerCursors.has(after)
    ) {
      throw new Error(
        `Blocking dependency metadata for ${raw.identifier} exceeds the read bound`
      );
    }
    blockerCursors.add(after);
    const more = await linearGraphql(fetchImpl, apiKey, BLOCKERS_PAGE_QUERY, {
      issueId: raw.id,
      after,
    });
    blockerPage = more.issue?.inverseRelations;
  }
  const history = [];
  let historyPage = raw.history;
  for (let page = 0; ; page += 1) {
    if (
      !Array.isArray(historyPage?.nodes) ||
      typeof historyPage?.pageInfo?.hasNextPage !== 'boolean'
    ) {
      throw new Error(`Malformed lifecycle history for ${raw.identifier}`);
    }
    history.push(...historyPage.nodes);
    if (!historyPage.pageInfo.hasNextPage) break;
    if (page >= MAX_COMMENT_PAGES || !historyPage.pageInfo.endCursor) {
      throw new Error(
        `Lifecycle history for ${raw.identifier} exceeds the read bound`
      );
    }
    const more = await linearGraphql(fetchImpl, apiKey, HISTORY_PAGE_QUERY, {
      issueId: raw.id,
      after: historyPage.pageInfo.endCursor,
    });
    historyPage = more.issue?.history;
  }
  const reopens = history.filter(
    entry =>
      entry?.fromState?.type === 'completed' &&
      typeof entry?.toState?.type === 'string' &&
      entry.toState.type !== 'completed'
  );
  const reopenTimes = reopens.map(entry =>
    Date.parse(String(entry.createdAt ?? ''))
  );
  const receiptNotBefore = reopenTimes.some(time => !Number.isFinite(time))
    ? null
    : reopenTimes.length > 0
      ? new Date(Math.max(...reopenTimes)).toISOString()
      : undefined;
  if (
    !Array.isArray(raw.comments?.nodes) ||
    typeof raw.comments?.pageInfo?.hasNextPage !== 'boolean'
  ) {
    throw new Error(
      `Unreadable lifecycle preimage comments for ${raw.identifier}`
    );
  }
  const comments = [...raw.comments.nodes];
  let pageInfo = raw.comments.pageInfo;
  for (
    let page = 0;
    pageInfo?.hasNextPage === true && page < MAX_COMMENT_PAGES;
    page += 1
  ) {
    const more = await linearGraphql(fetchImpl, apiKey, COMMENTS_PAGE_QUERY, {
      issueId: raw.id,
      after: pageInfo.endCursor,
    });
    const nextPage = more.issue?.comments;
    if (
      !Array.isArray(nextPage?.nodes) ||
      typeof nextPage?.pageInfo?.hasNextPage !== 'boolean'
    ) {
      throw new Error(
        `Unreadable lifecycle preimage comments for ${raw.identifier}`
      );
    }
    comments.push(...nextPage.nodes);
    pageInfo = nextPage.pageInfo;
  }
  if (pageInfo?.hasNextPage === true) {
    throw new Error(
      `Comment history for ${raw.identifier} exceeds the read bound`
    );
  }
  comments.sort(
    (left, right) =>
      Date.parse(String(left?.createdAt ?? '')) -
      Date.parse(String(right?.createdAt ?? ''))
  );
  const snapshot = readIssueSnapshot({
    ...raw,
    comments: { nodes: comments },
  });
  const childNodes = [];
  let childPage = raw.children;
  for (let page = 0; ; page += 1) {
    if (
      !Array.isArray(childPage?.nodes) ||
      typeof childPage?.pageInfo?.hasNextPage !== 'boolean'
    ) {
      throw new Error(
        `Child delivery evidence for ${raw.identifier} is incomplete`
      );
    }
    childNodes.push(...childPage.nodes);
    if (!childPage.pageInfo.hasNextPage) break;
    // JOV-5853 has more shipped children than one page. A missing cursor is
    // still incomplete evidence; a later page is read before any child closes.
    if (page >= MAX_CHILD_PAGES || !childPage.pageInfo.endCursor) {
      throw new Error(
        `Child delivery evidence for ${raw.identifier} is incomplete`
      );
    }
    const more = await linearGraphql(fetchImpl, apiKey, CHILDREN_PAGE_QUERY, {
      issueId: raw.id,
      after: childPage.pageInfo.endCursor,
    });
    childPage = more.issue?.children;
  }
  const childDeliveryTimes = childNodes
    .filter(child => ['completed', 'canceled'].includes(child?.state?.type))
    .map(child =>
      Date.parse(
        String(
          child.state.type === 'completed'
            ? child.completedAt
            : child.canceledAt
        )
      )
    );
  if (childDeliveryTimes.some(time => !Number.isFinite(time))) {
    throw new Error(
      `Child delivery timestamp for ${raw.identifier} is unknown`
    );
  }
  return {
    ...snapshot,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : '',
    state: {
      id: String(raw.state?.id ?? ''),
      name: String(raw.state?.name ?? ''),
      type: String(raw.state?.type ?? ''),
    },
    commentRecords: comments.map(comment => ({
      body: String(comment?.body ?? ''),
      createdAt: String(comment?.createdAt ?? ''),
    })),
    children: childNodes.map(child =>
      String(child?.identifier ?? '').toUpperCase()
    ),
    hasChildren: childNodes.length > 0,
    openChildren: childNodes
      .filter(
        child =>
          !['completed', 'canceled'].includes(String(child?.state?.type ?? ''))
      )
      .map(child => String(child?.identifier ?? '').toUpperCase())
      .filter(Boolean),
    blockingIssues,
    reopenedAfterDone: reopens.length > 0,
    receiptNotBefore,
    ...(childDeliveryTimes.length > 0
      ? {
          outcomeNotBefore: new Date(
            Math.max(...childDeliveryTimes)
          ).toISOString(),
        }
      : {}),
    attachmentUrls: (raw.attachments?.nodes ?? [])
      .map(node => String(node?.url ?? ''))
      .filter(Boolean),
  };
}

/**
 * The issue inputs used by this decision, including separately versioned
 * comments and child delivery. Preserve canonical comment order (including
 * equal-time ties); normalize only unordered inputs. Never log raw content.
 * This guards fact-read races; the final read-to-mutation interval remains
 * non-atomic.
 *
 * @param {Awaited<ReturnType<typeof readLifecycleIssue>>} issue
 */
function lifecyclePreimage(issue) {
  if (
    !issue?.id ||
    !issue.state.id ||
    !issue.state.name ||
    !issue.state.type ||
    !Number.isFinite(Date.parse(issue.updatedAt)) ||
    issue.acceptanceMetadataVerified !== true ||
    issue.commentRecords.some(
      comment => !Number.isFinite(Date.parse(comment.createdAt))
    )
  ) {
    throw new Error(
      `Unreadable lifecycle preimage for ${issue?.identifier ?? 'issue'}`
    );
  }
  return JSON.stringify({
    id: issue.id,
    updatedAt: issue.updatedAt,
    state: issue.state,
    title: issue.title,
    description: issue.description,
    labels: [...issue.labels].sort(),
    reopenedAfterDone: issue.reopenedAfterDone,
    receiptNotBefore: issue.receiptNotBefore ?? null,
    outcomeNotBefore: issue.outcomeNotBefore ?? null,
    comments: issue.commentRecords.map(comment =>
      JSON.stringify([comment.createdAt, comment.body])
    ),
    children: [...issue.children].sort(),
    openChildren: [...issue.openChildren].sort(),
    blockingIssues: issue.blockingIssues
      .map(dependency => JSON.stringify(dependency))
      .sort(),
    attachments: [...issue.attachmentUrls].sort(),
    states: issue.states
      .map(state => JSON.stringify([state.id, state.name, state.type]))
      .sort(),
  });
}

/**
 * The Linear side of one lifecycle evaluation: read the issue, compute the
 * merge-sync holds, and hand the writes to a port that re-reads state first.
 *
 * @param {{
 *   readonly lookupId: string,
 *   readonly fetchImpl: HttpFetch,
 *   readonly apiKey: string,
 *   readonly github: import('./validation-sync.mjs').GithubGet,
 *   readonly repository: string,
 *   readonly facts: ReturnType<typeof createProductionFacts>,
 *   readonly openPulls: { pulls: readonly object[], complete: boolean },
 *   readonly harnessManifest: unknown,
 *   readonly assuranceMatrix: unknown,
 *   readonly allowlist?: ReadonlySet<string>,
 *   readonly eventPull?: { number: number },
 *   readonly dryRun?: boolean,
 *   readonly issue?: Awaited<ReturnType<typeof readLifecycleIssue>>,
 *   readonly log: (message: string) => void,
 * }} ctx
 */
export async function reconcileIssueLifecycle(ctx) {
  const issue =
    ctx.issue !== undefined
      ? ctx.issue
      : await readLifecycleIssue(ctx.fetchImpl, ctx.apiKey, ctx.lookupId);
  if (!issue?.id || !issue.identifier) {
    ctx.log(
      `Could not resolve Linear issue for lookup '${ctx.lookupId}'; skipping`
    );
    return { action: 'skip', identifier: '', target: null, comment: '' };
  }
  const checkGreen =
    deprecationCheckGreen(issue) ??
    (issue.commentRecords ?? []).some(comment =>
      String(comment?.body ?? '').includes(GREEN_MARKER)
    );
  const { holds } = lifecycleHolds({
    issue,
    pullRequests: ctx.openPulls.pulls,
    mergingNumber: ctx.eventPull?.number,
    scanComplete: ctx.openPulls.complete,
    checkGreen,
  });
  /** @param {string} query @param {Record<string, unknown>} variables */
  const linear = (query, variables) =>
    linearGraphql(ctx.fetchImpl, ctx.apiKey, query, variables);
  return reconcileValidation({
    issue,
    holds,
    completionHolds: issue.blockingIssues
      .filter(
        dependency =>
          dependency.state.type !== 'completed' ||
          dependency.state.name !== LIFECYCLE_STATES.done
      )
      .map(
        dependency =>
          `Blocking prerequisite ${dependency.identifier} is ${dependency.state.name}; Done is required before closure.`
      )
      .sort(),
    parentReason: parentHoldReason(issue, ctx.allowlist),
    github: ctx.github,
    repository: ctx.repository,
    facts: ctx.facts,
    harnessManifest: ctx.harnessManifest,
    assuranceMatrix: ctx.assuranceMatrix,
    eventPull: ctx.eventPull,
    dryRun: ctx.dryRun,
    log: ctx.log,
    linear: {
      readStateId: async issueId => {
        // Only moving decisions pay for this complete read. Issue updatedAt
        // alone cannot prove unchanged comments or child delivery/acceptance.
        const current = await readLifecycleIssue(
          ctx.fetchImpl,
          ctx.apiKey,
          issueId
        );
        if (current?.id !== issueId) {
          throw new Error(`Unreadable lifecycle preimage for ${issueId}`);
        }
        return lifecyclePreimage(current) === lifecyclePreimage(issue)
          ? current.state.id
          : '';
      },
      setState: async (issueId, stateId) =>
        String(
          (
            await linear(
              `mutation SetLifecycleState($issueId: String!, $stateId: String!) {
        issueUpdate(id: $issueId, input: { stateId: $stateId }) { success issue { state { name } } }
      }`,
              { issueId, stateId }
            )
          ).issueUpdate?.issue?.state?.name ?? ''
        ),
      addComment: async (issueId, body) =>
        (
          await linear(
            `mutation AddLifecycleComment($issueId: String!, $body: String!) {
        commentCreate(input: { issueId: $issueId, body: $body }) { success }
      }`,
            { issueId, body }
          )
        ).commentCreate?.success === true,
      readDescription: async issueId => {
        const data = await linear(
          `query IssueLifecycleDescription($issueId: String!) {
        issue(id: $issueId) { description }
      }`,
          { issueId }
        );
        if (!data.issue) throw new Error(`Could not re-read ${issueId}`);
        return String(data.issue.description ?? '');
      },
      setDescription: async (issueId, description) =>
        (
          await linear(
            `mutation SetLifecycleDescription($issueId: String!, $description: String!) {
        issueUpdate(id: $issueId, input: { description: $description }) { success }
      }`,
            { issueId, description }
          )
        ).issueUpdate?.success === true,
    },
  });
}

/**
 * @param {string} root
 * @param {string} path
 * @returns {unknown}
 */
function loadJson(root, path) {
  try {
    return JSON.parse(readFileSync(resolvePath(root, path), 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Merge event: evaluate the linked issue. Sweep (production generation
 * completed, schedule, manual replay): evaluate every issue in the lifecycle
 * states. Both run the same evaluation, so order and replay do not matter.
 *
 * @param {{
 *   readonly fetchImpl?: HttpFetch,
 *   readonly env?: NodeJS.ProcessEnv,
 *   readonly log?: (message: string) => void,
 *   readonly allowlist?: ReadonlySet<string>,
 *   readonly harnessManifest?: unknown,
 *   readonly assuranceMatrix?: unknown,
 *   readonly verifyMarker?: (sha: string, controllerWorkflowId: number) => Promise<boolean> | boolean,
 *   readonly sleep?: (ms: number) => Promise<void>,
 * }} [options]
 */
export async function syncLinearIssueOnMerge(options = {}) {
  const previousSleep = sleepFn;
  if (options.sleep) sleepFn = options.sleep;
  try {
    return await runSync(options);
  } finally {
    sleepFn = previousSleep;
  }
}

/**
 * @param {{
 *   readonly fetchImpl?: HttpFetch,
 *   readonly env?: NodeJS.ProcessEnv,
 *   readonly log?: (message: string) => void,
 *   readonly allowlist?: ReadonlySet<string>,
 *   readonly harnessManifest?: unknown,
 *   readonly assuranceMatrix?: unknown,
 *   readonly verifyMarker?: (sha: string, controllerWorkflowId: number) => Promise<boolean> | boolean,
 * }} options
 */
async function runSync(options) {
  /** @type {HttpFetch} */
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const env = options.env ?? process.env;
  const log = options.log ?? (message => console.log(message));
  const sweep = env.LIFECYCLE_MODE === 'sweep';
  const receiptIssue = String(env.LINEAR_VALIDATION_ISSUE ?? '').toUpperCase();
  // Nonempty malformed targets have their own workflow concurrency group.
  // They must never widen into parallel global sweeps or make external reads.
  if (sweep && receiptIssue && !IDENTIFIER_RE.test(receiptIssue)) {
    throw new Error('Malformed LINEAR_VALIDATION_ISSUE: expected JOV-<number>');
  }
  const ref = extractMergeIssueRef({
    body: env.PR_BODY,
    headRef: env.HEAD_REF,
  });
  if (!sweep && !ref.identifier && !ref.issueId) {
    log('No linear issue marker or branch identifier found; skipping');
    return { action: 'skip', comment: '', identifier: '', results: [] };
  }
  const apiKey = env.LINEAR_API_KEY ?? '';
  if (!apiKey) {
    log('LINEAR_API_KEY not set; skipping');
    return {
      action: 'skip',
      comment: '',
      identifier: ref.identifier,
      results: [],
    };
  }
  const repository = env.GITHUB_REPOSITORY ?? '';
  const token = env.GITHUB_TOKEN ?? '';
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository) || !token) {
    throw new Error(
      'GITHUB_REPOSITORY and GITHUB_TOKEN are required before moving a Linear issue'
    );
  }
  const github = immutableGithubCache(
    githubClient(fetchImpl, token, sleepFn),
    env.LINEAR_SYNC_GITHUB_CACHE_DIR
  );
  const facts = createProductionFacts({
    fetchImpl,
    github,
    repository,
    versionUrl: env.PRODUCTION_VERSION_URL,
    verifyMarker: options.verifyMarker,
  });
  const root = env.GITHUB_WORKSPACE ?? process.cwd();
  const harnessManifest =
    options.harnessManifest ?? loadJson(root, CI_HARNESS_MANIFEST);
  const assuranceMatrix =
    options.assuranceMatrix ?? loadJson(root, ASSURANCE_MATRIX);
  let openPulls = {
    pulls: /** @type {object[]} */ ([]),
    complete: true,
  };
  let openPullFailure = '';
  try {
    openPulls = await listOpenPullRequests({ fetchImpl, token, repository });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const flagged =
      /** @type {{ rateLimited?: boolean, forbidden?: boolean }} */ (error);
    if (flagged.rateLimited && sweep) {
      // Quota is already spent. Evaluating issues would 403 the first linked
      // pull (JOV-7355 → #19767 on 2026-10-15) and label that as a Linear
      // deferral. Leave the cursor where it is and let the next sweep resume.
      // A merge event still fails closed unless the answer is specifically an
      // installation 403, which the process exit soft-fails.
      if (isInstallationQuota403(message)) {
        log(installationQuotaLog('Linear Sync'));
      }
      log(`Open pull request scan deferred: ${message}`);
      return {
        action: 'deferred',
        comment: '',
        identifier: ref.identifier,
        results: [],
        deferred: 0,
      };
    }
    if (flagged.forbidden) {
      throw new Error(
        `Open pull request scan refused (${message}). This is a token permission gap; permissions and tokens were not changed.`
      );
    }
    log(`Open pull request scan failed: ${message}`);
    openPulls = { pulls: [], complete: false };
    openPullFailure = message;
  }

  const lookups = [];
  if (sweep && IDENTIFIER_RE.test(receiptIssue)) {
    // A receipt for parent-only commissioning work need not have a PR.
    // Read exactly its canonical record; the evaluator still owns admission.
    lookups.push(receiptIssue);
  } else if (sweep) {
    /** @type {{ identifier: string, updatedAt: string }[]} */
    const found = [];
    let after = null;
    for (let page = 0; page < MAX_SWEEP_PAGES; page += 1) {
      const data = await linearGraphql(fetchImpl, apiKey, SWEEP_QUERY, {
        states: [
          'In Progress',
          'In Review',
          LIFECYCLE_STATES.merging,
          LIFECYCLE_STATES.validating,
          LIFECYCLE_STATES.rework,
        ],
        after,
      });
      for (const node of data.issues?.nodes ?? []) {
        // A missed merge event can strand linked work before Merging. Scan
        // that delivery evidence, without pulling unrelated active writers
        // into the lifecycle or interpreting age/status as completion.
        if (
          ['In Progress', 'In Review'].includes(node.state?.name) &&
          !(node.children?.nodes?.length > 0) &&
          !(node.labels?.nodes ?? []).some(label =>
            /epic|commission/i.test(label?.name ?? '')
          ) &&
          !(node.attachments?.nodes ?? []).some(attachment =>
            String(attachment.url ?? '')
              .toLowerCase()
              .startsWith(
                `https://github.com/${repository}/pull/`.toLowerCase()
              )
          )
        )
          continue;
        if (typeof node?.identifier === 'string') {
          found.push({
            identifier: node.identifier,
            updatedAt: String(node.updatedAt ?? ''),
          });
        }
      }
      if (data.issues?.pageInfo?.hasNextPage !== true) break;
      after = data.issues.pageInfo.endCursor;
    }
    // Least recently touched first. A persisted cursor rotates the list so a
    // rate limit resumes at the issue that did not finish, instead of
    // re-reading the same prefix until the quota is gone again.
    found.sort(
      (left, right) =>
        (Date.parse(left.updatedAt) || 0) - (Date.parse(right.updatedAt) || 0)
    );
    const ordered = found.map(entry => entry.identifier);
    const cursor = readSweepCursor(env.LINEAR_SYNC_CURSOR_DIR);
    const start = cursor?.nextIdentifier
      ? ordered.indexOf(cursor.nextIdentifier)
      : -1;
    lookups.push(...(start > 0 ? ordered.slice(start) : ordered));
  } else {
    lookups.push(ref.issueId || ref.identifier);
  }

  const eventPull = sweep ? undefined : { number: Number(env.PR_NUMBER) };
  const cursorDir =
    sweep && !receiptIssue ? env.LINEAR_SYNC_CURSOR_DIR : undefined;
  const results = [];
  const failures = [];
  let deferredNote = '';
  let deferredDetail = '';
  let cursorSaved = false;
  const deferAt = (lookupId, message) => {
    const source = message.startsWith('Linear')
      ? 'Linear'
      : message.startsWith('GitHub')
        ? 'GitHub'
        : 'upstream';
    writeSweepCursor(cursorDir, lookupId);
    cursorSaved = true;
    const resumeAt = lookups.indexOf(lookupId);
    const deferred = lookups.length - (resumeAt === -1 ? 0 : resumeAt);
    deferredNote = `${deferred} issue(s) deferred to the next sweep by the ${source} rate limit; resume at ${lookupId}`;
    deferredDetail = message;
    if (isInstallationQuota403(message)) {
      log(installationQuotaLog('Linear Sync'));
    }
    log(`Lifecycle evaluation deferred at ${lookupId}: ${message}`);
    log(deferredNote);
  };
  for (let index = 0; index < lookups.length; ) {
    const slice = lookups.slice(index, index + SWEEP_BATCH_SIZE);
    /** @type {Awaited<ReturnType<typeof fetchLifecycleRaws>> | undefined} */
    let raws;
    try {
      raws = await fetchLifecycleRaws(fetchImpl, apiKey, slice);
    } catch (error) {
      const flagged = /** @type {{ rateLimited?: boolean }} */ (error);
      if (flagged.rateLimited) {
        deferAt(
          slice[0],
          error instanceof Error ? error.message : String(error)
        );
        break;
      }
      // A rejected batch query falls back to one read per issue. Rate limits
      // already stopped above, so this is a query the alias form could not run.
      raws = undefined;
    }
    let stopped = false;
    for (let offset = 0; offset < slice.length; offset += 1) {
      const lookupId = slice[offset];
      try {
        const issue = raws
          ? raws[offset]
            ? await materializeLifecycleIssue(fetchImpl, apiKey, raws[offset])
            : null
          : undefined;
        results.push(
          await reconcileIssueLifecycle({
            lookupId,
            fetchImpl,
            apiKey,
            github,
            repository,
            facts,
            openPulls,
            harnessManifest,
            assuranceMatrix,
            allowlist: options.allowlist,
            eventPull,
            dryRun: env.LIFECYCLE_DRY_RUN === '1',
            issue,
            log,
          })
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const flagged =
          /** @type {{ rateLimited?: boolean, forbidden?: boolean, unreadable?: boolean }} */ (
            error
          );
        if (flagged.unreadable || flagged.forbidden) {
          log(
            `Linked pull request was not readable for ${lookupId}: ${message}`
          );
          results.push({
            action: 'skip',
            identifier: lookupId,
            target: null,
            comment: '',
          });
          continue;
        }
        if (flagged.rateLimited) {
          deferAt(lookupId, message);
          stopped = true;
          break;
        }
        failures.push(`${lookupId}: ${message}`);
        log(`Lifecycle evaluation failed for ${lookupId}: ${message}`);
      }
    }
    if (stopped) break;
    index += slice.length;
  }
  if (sweep && !cursorSaved) writeSweepCursor(cursorDir, '');
  const reasons = [...failures];
  if (!openPulls.complete) {
    const detail =
      openPullFailure && isInstallationQuota403(openPullFailure)
        ? ` (${openPullFailure})`
        : '';
    reasons.unshift(
      `the open pull request scan failed${detail}, so issues were left in place`
    );
  }
  if (reasons.length > 0 || (deferredNote && !sweep)) {
    const quotaDetail =
      deferredDetail && isInstallationQuota403(deferredDetail)
        ? deferredDetail
        : '';
    throw new Error(
      `Lifecycle evaluation failed: ${[...reasons, deferredNote, quotaDetail].filter(Boolean).join('; ')}`
    );
  }
  const first = results[0];
  return {
    action: deferredNote ? 'deferred' : (first?.action ?? 'skip'),
    comment: first?.comment ?? '',
    identifier: first?.identifier ?? ref.identifier,
    results,
    deferred: deferredNote ? Number(deferredNote.split(' ')[0]) || 0 : 0,
  };
}

/**
 * Record an owner receipt: `receipt --issue JOV-1 --kind outcome --status pass
 * --sha <full sha> --evidence <url> [--note <text>]
 * [--episode-started-at null|<server reopen timestamp>]`. Omit the episode flag
 * only for existing unbound producers; null explicitly binds the initial episode. A founder-taste
 * rejection carries the founder's note into Rework.
 *
 * @param {readonly string[]} args
 * @param {{ fetchImpl?: HttpFetch, env?: NodeJS.ProcessEnv }} [options]
 */
export async function recordValidationReceipt(args, options = {}) {
  const value = (/** @type {string} */ name) => {
    const index = args.indexOf(name);
    return index === -1 ? '' : String(args[index + 1] ?? '');
  };
  const body = formatValidationReceipt({
    issue: value('--issue').toUpperCase(),
    kind: value('--kind'),
    status: /** @type {'pass' | 'fail'} */ (value('--status')),
    sha: value('--sha'),
    evidence: value('--evidence'),
    note: value('--note'),
    ...(args.includes('--episode-started-at')
      ? {
          episodeStartedAt:
            value('--episode-started-at') === 'null'
              ? null
              : value('--episode-started-at'),
        }
      : {}),
  });
  const env = options.env ?? process.env;
  const apiKey = env.LINEAR_API_KEY ?? '';
  if (!apiKey)
    throw new Error('LINEAR_API_KEY is required to record a receipt');
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const data = await linearGraphql(fetchImpl, apiKey, ISSUE_STATE_QUERY, {
    issueId: value('--issue').toUpperCase(),
  });
  if (typeof data.issue?.id !== 'string') {
    throw new Error(`Could not resolve ${value('--issue')}`);
  }
  const created = await linearGraphql(
    fetchImpl,
    apiKey,
    `mutation AddValidationReceipt($issueId: String!, $body: String!) {
      commentCreate(input: { issueId: $issueId, body: $body }) { success }
    }`,
    { issueId: data.issue.id, body }
  );
  if (created.commentCreate?.success !== true) {
    throw new Error('Linear refused the validation receipt');
  }
  return body;
}

const isDirectRun =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  const [command, ...rest] = process.argv.slice(2);
  const run =
    command === 'receipt'
      ? recordValidationReceipt(rest).then(body => console.log(body))
      : syncLinearIssueOnMerge();
  run
    .catch(error => {
      const disposition = failureDisposition('Linear Sync', error);
      console.error(disposition.log);
      if (!disposition.softFailed) process.exitCode = disposition.code;
    })
    .finally(() => {
      // Save the immutable-read cache only when its content changed.
      const dir = process.env.LINEAR_SYNC_GITHUB_CACHE_DIR;
      const digest = dir ? boundGithubCache(dir) : '';
      if (digest && process.env.GITHUB_OUTPUT) {
        appendFileSync(
          process.env.GITHUB_OUTPUT,
          `github_cache_key=linear-sync-github-v1-${digest}\n`
        );
      }
    });
}
