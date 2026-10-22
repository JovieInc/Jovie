#!/usr/bin/env node
/**
 * Screen-audit validation receipts (JOV-7713 machine evidence, written
 * automatically).
 *
 * The Validating lifecycle requires a `screen-audit` receipt when a merged UI
 * change invalidates assurance-matrix rows. Before this, nothing wrote that
 * receipt, so 98 issues waited in Validating with no exit (2026-10-21).
 *
 * When a production generation is verified and Product Screenshots has run
 * on that exact commit, this audits the full screen inventory once. Then, for
 * every Validating/Merging issue that still owes a screen-audit receipt, it
 * decides from the merged paths:
 *   - changed screens all green at that build: pass;
 *   - any changed screen red: fail (the lifecycle routes it to Rework);
 *   - any changed screen uncovered or missing evidence: no receipt. It is
 *     reported, because nothing can prove it and a guess is not evidence;
 *   - the merged paths map to no registered screen: pass (the registry's path
 *     ownership attributes no screen to this change) unless a red inventory
 *     screen has no remediation issue yet, which holds until it is tracked.
 * Every receipt names its sha, the screenshots run and the verdicts. The
 * lifecycle still checks that the sha is a verified production generation
 * containing the binding merge.
 *
 * Usage:
 *   node scripts/lib/screen-audit-receipts.mjs --artifacts <dir> --sha <40>
 *     [--screens-sha <40>] --run-url <url> [--out <summary.json>] [--dry-run]
 * --sha is the verified production generation; --screens-sha the commit the
 * screenshots ran on (default --sha). An ancestor counts only when no
 * render-root path changed between them.
 * Needs LINEAR_API_KEY and GH_TOKEN.
 */

import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { createGitHubClient } from '../../packages/api-client/github.ts';
import { createLinearClient } from '../../packages/api-client/linear.ts';
import {
  auditScreens,
  changedScreenManifest,
  loadArtifacts,
} from '../invariants/screen-audit.mjs';
import {
  formatValidationReceipt,
  parseValidationReceipts,
  VALIDATION_MANIFEST_SCHEMA,
} from './validation-lifecycle.mjs';

const MANIFEST_MARKER = /<!--\s*validation-manifest:v1\s*\n([\s\S]*?)-->/g;
const FULL_SHA = /^[0-9a-f]{40}$/;
const SCREEN_REMEDIATION_PREFIX = 'remediation:screen-audit:';
const REPO = 'JovieInc/Jovie';
// Paths that can change what a screen renders. Screenshots taken at an
// ancestor stand for the production build only if none of these changed.
const RENDER_ROOTS = ['apps/web/', 'apps/desktop/', 'packages/ui/'];

/**
 * True when the build at `sha` renders exactly what `screensSha` rendered:
 * the same commit, or an ancestor with no change under a render root.
 * @param {any} github @param {string} screensSha @param {string} sha
 */
export async function rendersSameAs(github, screensSha, sha) {
  if (screensSha === sha) return { same: true, detail: 'same commit' };
  const response = await github.rest(
    'GET',
    `/repos/${REPO}/compare/${screensSha}...${sha}?per_page=300`
  );
  const body = /** @type {any} */ (await response.json());
  if (body?.status !== 'ahead' && body?.status !== 'identical')
    return {
      same: false,
      detail: `screenshots commit is ${body?.status ?? 'unknown'} of the build`,
    };
  const files = (body.files ?? []).map((/** @type {any} */ file) =>
    String(file.filename)
  );
  if (files.length >= 300)
    return { same: false, detail: 'too many changed files to prove' };
  const rendered = files.filter(file =>
    RENDER_ROOTS.some(root => file.startsWith(root))
  );
  return rendered.length === 0
    ? {
        same: true,
        detail: `ancestor ${screensSha.slice(0, 12)}; no render-root change since`,
      }
    : {
        same: false,
        detail: `${rendered.length} render-root file(s) changed since the screenshots commit`,
      };
}

/**
 * The newest validation manifest the lifecycle wrote on the issue.
 * @param {readonly { body?: string, createdAt?: string }[]} comments
 */
export function latestManifest(comments) {
  let best = null;
  let bestAt = -Infinity;
  for (const comment of comments) {
    const at = Date.parse(String(comment?.createdAt ?? ''));
    for (const match of String(comment?.body ?? '').matchAll(MANIFEST_MARKER)) {
      try {
        const manifest = JSON.parse(match[1]);
        if (manifest?.schema !== VALIDATION_MANIFEST_SCHEMA) continue;
        if (at >= bestAt) {
          best = manifest;
          bestAt = at;
        }
      } catch {
        // A malformed manifest is not evidence; the lifecycle rewrites it.
      }
    }
  }
  return best;
}

/**
 * @param {{
 *   manifest: any,
 *   mergedFiles: readonly string[],
 *   ledger: { screens: readonly { id: string, verdict: string, findings?: readonly unknown[] }[] },
 *   remediationCreatedAt: Readonly<Record<string, string>>,
 * }} input
 * @returns {{ action: 'pass' | 'fail' | 'hold' | 'skip', detail: string }}
 */
export function decideScreenAuditReceipt(input) {
  const required = (input.manifest?.required ?? []).some(
    (/** @type {{ kind?: string }} */ entry) => entry?.kind === 'screen-audit'
  );
  if (!required) return { action: 'skip', detail: 'no screen-audit owed' };
  const verdict = new Map(
    input.ledger.screens.map(screen => [screen.id, screen])
  );
  const changed = [
    ...new Set(
      changedScreenManifest([...input.mergedFiles]).screens.map(
        (/** @type {{ screenId: string }} */ screen) => screen.screenId
      )
    ),
  ].sort();
  if (changed.length > 0) {
    const rows = changed.map(id => ({
      id,
      verdict: verdict.get(id)?.verdict ?? 'unregistered',
      findings: verdict.get(id)?.findings?.length ?? 0,
    }));
    const red = rows.filter(row => row.verdict === 'red');
    if (red.length > 0)
      return {
        action: 'fail',
        detail: `changed screens red: ${red.map(row => `${row.id} (${row.findings} findings)`).join(', ')}`,
      };
    const unproven = rows.filter(row => row.verdict !== 'green');
    if (unproven.length > 0)
      return {
        action: 'hold',
        detail: `no machine evidence for changed screens: ${unproven.map(row => `${row.id}=${row.verdict}`).join(', ')}`,
      };
    return {
      action: 'pass',
      detail: `changed screens green: ${changed.join(', ')}`,
    };
  }
  // The registry's path ownership is the attribution rule: these paths own
  // no screen, so no screen's verdict is this change's evidence. Red screens
  // still block when nothing tracks them (no fingerprinted remediation
  // issue yet), so a regression is never silently passed over.
  const red = input.ledger.screens.filter(screen => screen.verdict === 'red');
  const untracked = red.filter(
    screen => !input.remediationCreatedAt[screen.id]
  );
  if (untracked.length > 0)
    return {
      action: 'hold',
      detail: `merged paths map to no registered screen, but red screens ${untracked.map(screen => screen.id).join(', ')} have no remediation issue yet (the nightly screen audit files them)`,
    };
  return {
    action: 'pass',
    detail: `merged paths map to no registered screen (vacuously green); inventory red screens are each tracked by a remediation issue: ${red.map(screen => screen.id).join(', ') || 'none'}`,
  };
}

const ISSUES_QUERY = `query($after: String) {
  issues(first: 25, after: $after, filter: { team: { key: { eq: "JOV" } }, state: { name: { in: ["Validating", "Merging"] } } }) {
    pageInfo { hasNextPage endCursor }
    nodes { id identifier comments(last: 50) { nodes { body createdAt } } }
  }
}`;
const REMEDIATION_QUERY = `query($after: String) {
  issues(first: 100, after: $after, filter: { labels: { name: { startsWith: "${SCREEN_REMEDIATION_PREFIX}" } } }) {
    pageInfo { hasNextPage endCursor }
    nodes { createdAt labels { nodes { name } } }
  }
}`;

/** @param {any} linear @param {string} query */
async function allPages(linear, query) {
  const nodes = [];
  let after = null;
  for (let page = 0; page < 40; page += 1) {
    const data = await linear.graphql(query, { after });
    nodes.push(...data.issues.nodes);
    if (!data.issues.pageInfo.hasNextPage) break;
    after = data.issues.pageInfo.endCursor;
  }
  return nodes;
}

/** @param {any} github @param {string} url */
async function pullFiles(github, url) {
  const number = Number(/\/pull\/(\d+)$/.exec(String(url))?.[1]);
  if (!number) return null;
  const files = await github.paginate(
    `/repos/${REPO}/pulls/${number}/files?per_page=100`,
    { maxPages: 30 }
  );
  return files.map((/** @type {any} */ file) => String(file.filename));
}

/**
 * @param {{
 *   artifacts: string,
 *   sha: string,
 *   screensSha?: string,
 *   runUrl: string,
 *   dryRun?: boolean,
 *   linear: { graphql: (query: string, variables?: Record<string, unknown>) => Promise<any> },
 *   github: any,
 *   log?: (line: string) => void,
 * }} options
 */
export async function produceScreenAuditReceipts(options) {
  if (!FULL_SHA.test(options.sha)) throw new Error('--sha must be 40 hex');
  const log = options.log ?? (line => process.stdout.write(`${line}\n`));
  const screensSha = (options.screensSha ?? options.sha).toLowerCase();
  if (!FULL_SHA.test(screensSha))
    throw new Error('--screens-sha must be 40 hex');
  const sameBuild = await rendersSameAs(
    options.github,
    screensSha,
    options.sha
  );
  if (!sameBuild.same) {
    log(
      `[screen-audit-receipts] ${options.sha.slice(0, 12)} skipped: ${sameBuild.detail}`
    );
    return {
      sha: options.sha,
      skipped: sameBuild.detail,
      counts: {},
      results: [],
    };
  }
  const ledger = auditScreens({
    ...loadArtifacts(options.artifacts),
    judge: null,
  });
  /** @type {Record<string, string>} */
  const remediationCreatedAt = {};
  for (const node of await allPages(options.linear, REMEDIATION_QUERY)) {
    for (const label of node.labels.nodes) {
      const id = String(label.name).startsWith(SCREEN_REMEDIATION_PREFIX)
        ? String(label.name).slice(SCREEN_REMEDIATION_PREFIX.length)
        : null;
      if (!id) continue;
      const previous = remediationCreatedAt[id];
      if (!previous || Date.parse(node.createdAt) < Date.parse(previous))
        remediationCreatedAt[id] = node.createdAt;
    }
  }
  const results = [];
  for (const issue of await allPages(options.linear, ISSUES_QUERY)) {
    const comments = issue.comments.nodes;
    const manifest = latestManifest(comments);
    if (!manifest) continue;
    const already = parseValidationReceipts(comments, issue.identifier).some(
      receipt => receipt.kind === 'screen-audit' && receipt.sha === options.sha
    );
    if (already) {
      results.push({
        issue: issue.identifier,
        action: 'skip',
        detail: 'receipt for this build exists',
      });
      continue;
    }
    if (
      !(manifest.required ?? []).some(
        (/** @type {any} */ entry) => entry?.kind === 'screen-audit'
      )
    )
      continue;
    const mergedFiles = [];
    for (const url of manifest.mergedPulls ?? []) {
      mergedFiles.push(...((await pullFiles(options.github, url)) ?? []));
    }
    const decision = decideScreenAuditReceipt({
      manifest,
      mergedFiles,
      ledger,
      remediationCreatedAt,
    });
    results.push({ issue: issue.identifier, ...decision });
    if (decision.action !== 'pass' && decision.action !== 'fail') continue;
    const body = formatValidationReceipt({
      issue: issue.identifier,
      kind: 'screen-audit',
      status: decision.action,
      sha: options.sha,
      evidence: options.runUrl,
      note: `Automatic screen-audit receipt (screen-audit-receipts.mjs): ${decision.detail}. Screenshots: ${sameBuild.detail}. Inventory: ${JSON.stringify(ledger.totals)}.`,
      ...(Object.hasOwn(manifest, 'receiptNotBefore')
        ? { episodeStartedAt: manifest.receiptNotBefore }
        : {}),
    });
    if (options.dryRun) continue;
    await options.linear.graphql(
      'mutation($id: String!, $body: String!) { commentCreate(input: { issueId: $id, body: $body }) { success } }',
      { id: issue.id, body }
    );
  }
  /** @type {Record<string, number>} */
  const counts = {};
  for (const row of results) counts[row.action] = (counts[row.action] ?? 0) + 1;
  log(
    `[screen-audit-receipts] ${options.sha.slice(0, 12)} ${JSON.stringify(counts)}${options.dryRun ? ' (dry run)' : ''}`
  );
  return { sha: options.sha, totals: ledger.totals, counts, results };
}

/** @param {string[]} argv */
function argumentsOf(argv) {
  /** @type {Record<string, string | boolean>} */
  const args = { 'dry-run': false };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === '--dry-run') args['dry-run'] = true;
    else if (
      ['--artifacts', '--sha', '--screens-sha', '--run-url', '--out'].includes(
        flag
      ) &&
      argv[index + 1]
    ) {
      args[flag.slice(2)] = argv[index + 1];
      index += 1;
    } else throw new Error(`unsupported argument: ${flag}`);
  }
  return args;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const args = argumentsOf(process.argv.slice(2));
  const key = process.env.LINEAR_API_KEY ?? '';
  const token = process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN ?? '';
  if (!key || !token) {
    process.stderr.write('LINEAR_API_KEY and GH_TOKEN are required\n');
    process.exit(2);
  }
  produceScreenAuditReceipts({
    artifacts: String(args.artifacts ?? ''),
    sha: String(args.sha ?? '').toLowerCase(),
    screensSha: String(args['screens-sha'] ?? args.sha ?? '').toLowerCase(),
    runUrl: String(args['run-url'] ?? ''),
    dryRun: args['dry-run'] === true || process.env.DRY_RUN === 'true',
    linear: createLinearClient({
      identity: key,
      authorization: () => key,
      legacyStateRoot: null,
    }),
    github: createGitHubClient({ token }),
  })
    .then(summary => {
      if (args.out)
        writeFileSync(
          String(args.out),
          `${JSON.stringify(summary, null, 2)}\n`
        );
    })
    .catch(error => {
      process.stderr.write(
        `screen-audit-receipts: ${error instanceof Error ? error.message : String(error)}\n`
      );
      process.exitCode = 1;
    });
}
