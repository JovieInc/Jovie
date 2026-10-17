#!/usr/bin/env node

/**
 * Summer post-mortem review loop (JOV-6690).
 *
 * Deterministic core: template/control/action/closure audit, DetectionGap
 * projection, recurring failure-class grouping, and capability ranking.
 * Optional adapters: Linear issue/label reconciliation and GBrain mirroring.
 */

import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertEventDrivenLearning } from './lib/learning-trigger.mjs';
import {
  findLinearLabelId,
  upsertLinearIssueByTitleFingerprint,
} from './lib/linear-issue-intake.mjs';
import {
  lintPostmortem,
  parseFrontmatter,
} from './postmortem-linkage-check.mjs';

export const REPORT_SCHEMA = 'jovie.postmortem-review/v1';
export const DETECTION_GAP_CLASSES = Object.freeze([
  'bad-classification',
  'coverage-gap',
  'false-green',
  'founder-only-surface',
  'missing-invariant',
  'missing-join',
  'missing-remediator',
  'missing-signal',
  'remediator-failed',
  'stale-signal',
]);
export const REQUIRED_SECTIONS = Object.freeze([
  'Summary',
  'Impact',
  'Timeline',
  'Root cause',
  'Contributing causes',
  'Failure classes and invariants violated',
  'Why detection failed',
  'Instance fix',
  'Systemic controls',
  'Action items',
  'Open questions and unverified claims',
]);

const REPO_ROOT = fileURLToPath(new URL('../', import.meta.url));
const ISSUE_ID_RE = /\bJOV-\d+\b/g;
const POSTMORTEM_FILE_RE = /^\d{4}-\d{2}-\d{2}-[a-z0-9-]+\.md$/u;
const LIVE_RECEIPT_RE = /^(?:https:\/\/|docs\/|\.github\/|scripts\/)/u;

function unique(values) {
  return [...new Set(values)];
}

function section(source, heading) {
  const lines = source.split(/\r?\n/);
  const start = lines.findIndex(line => line.startsWith(`## ${heading}`));
  if (start === -1) return '';
  const next = lines.findIndex(
    (line, index) => index > start && line.startsWith('## ')
  );
  return lines
    .slice(start + 1, next === -1 ? undefined : next)
    .join('\n')
    .trim();
}

export function parseSystemicControls(source) {
  const controls = [];
  for (const line of section(source, 'Systemic controls').split(/\r?\n/)) {
    if (/^\d+\.\s+/u.test(line)) {
      controls.push(line.replace(/^\d+\.\s+/u, '').trim());
    } else if (controls.length > 0 && line.trim()) {
      controls[controls.length - 1] += ` ${line.trim()}`;
    }
  }
  return controls.map((text, index) => ({
    index: index + 1,
    text,
    issues: unique(text.match(ISSUE_ID_RE) ?? []),
  }));
}

export function parseActionRows(source) {
  const rows = [];
  for (const line of section(source, 'Action items').split(/\r?\n/)) {
    if (!/^\|\s*\[?JOV-\d+/u.test(line)) continue;
    const cells = line
      .split('|')
      .slice(1, -1)
      .map(cell => cell.trim());
    const issue = cells[0]?.match(ISSUE_ID_RE)?.[0];
    if (!issue || cells.length < 5) continue;
    rows.push({
      issue,
      control: cells[1],
      failureClass: cells[2].replaceAll('`', ''),
      state: cells[3],
      receipt: cells[4],
    });
  }
  return rows;
}

export function isVerifiedActionRow(row) {
  return (
    /^verified$/iu.test(row.state.trim()) &&
    LIVE_RECEIPT_RE.test(row.receipt.trim()) &&
    !/\b(?:pending|todo|tbd|none|merged only)\b/iu.test(row.receipt)
  );
}

function detectionProjection(meta, path) {
  const gapClasses = Array.isArray(meta.detection_gaps)
    ? meta.detection_gaps
    : [];
  const invalidGapClasses = gapClasses.filter(
    item => !DETECTION_GAP_CLASSES.includes(item)
  );
  const detectable =
    meta.detectable_before_human === 'true'
      ? true
      : meta.detectable_before_human === 'false'
        ? false
        : null;
  const replayCorpus = Array.isArray(meta.replay_corpus)
    ? meta.replay_corpus
    : [];
  const founderRescues = Number(meta.founder_rescues);
  const errors = [];
  if (detectable === null) {
    errors.push(`${path}: detectable_before_human must be true or false`);
  }
  if (gapClasses.length === 0) {
    errors.push(`${path}: detection_gaps must classify the DetectionGap`);
  }
  for (const gap of invalidGapClasses) {
    errors.push(`${path}: unknown DetectionGap class "${gap}"`);
  }
  if (replayCorpus.length === 0) {
    errors.push(`${path}: replay_corpus must include the real incident`);
  }
  if (!Number.isInteger(founderRescues) || founderRescues < 0) {
    errors.push(`${path}: founder_rescues must be a non-negative integer`);
  }
  return {
    schema: 'jovie.detection-gap/v1',
    source: path,
    detectableBeforeHuman: detectable,
    gapClasses,
    replayCorpus,
    founderRescues:
      Number.isInteger(founderRescues) && founderRescues >= 0
        ? founderRescues
        : null,
    compilerIssue: 'JOV-7084',
    complete: errors.length === 0,
    errors,
  };
}

export function reviewPostmortem(document, issueAudit = {}) {
  const { path, source } = document;
  const meta = parseFrontmatter(source) ?? {};
  const errors = [...lintPostmortem(path, source)];
  for (const required of REQUIRED_SECTIONS) {
    if (!section(source, required)) {
      errors.push(`${path}: missing required section "${required}"`);
    }
  }
  const controls = parseSystemicControls(source);
  const actionRows = parseActionRows(source);
  const frontmatterActions = Array.isArray(meta.actions) ? meta.actions : [];
  const rowIssues = new Set(actionRows.map(row => row.issue));
  const unlinkedControls = controls.filter(
    control => control.issues.length === 0
  );
  const auditAvailable = Object.keys(issueAudit).length > 0;
  for (const control of unlinkedControls) {
    errors.push(
      `${path}: systemic control ${control.index} has no Linear issue link`
    );
  }
  for (const control of controls) {
    for (const issue of control.issues) {
      if (!frontmatterActions.includes(issue)) {
        errors.push(
          `${path}: systemic control ${control.index} issue ${issue} is absent from frontmatter actions`
        );
      }
    }
  }
  for (const issue of frontmatterActions) {
    if (!rowIssues.has(issue)) {
      errors.push(`${path}: action ${issue} has no action-table row`);
    }
    const audit = issueAudit[issue];
    if (auditAvailable && !audit) {
      errors.push(`${path}: action ${issue} was not found in Linear`);
    }
    if (audit && !audit.labels?.includes('postmortem-action')) {
      errors.push(`${path}: action ${issue} lacks postmortem-action label`);
    }
  }
  const detectionGap = detectionProjection(meta, path);
  errors.push(...detectionGap.errors);
  const unverifiedActions = actionRows
    .filter(row => !isVerifiedActionRow(row))
    .map(row => row.issue);
  const closureEligible =
    frontmatterActions.length > 0 &&
    unverifiedActions.length === 0 &&
    frontmatterActions.every(issue => rowIssues.has(issue));
  if (
    ['controls-verified', 'closed'].includes(meta.status) &&
    !closureEligible
  ) {
    errors.push(
      `${path}: status ${meta.status} requires every action row verified with a live receipt`
    );
  }
  return {
    id: meta.id,
    path,
    status: meta.status,
    gbrain: meta.gbrain,
    failureClasses: Array.isArray(meta.failure_classes)
      ? meta.failure_classes
      : [],
    actions: frontmatterActions,
    controls,
    actionRows,
    issueAudit: Object.fromEntries(
      frontmatterActions.map(issue => [issue, issueAudit[issue] ?? null])
    ),
    detectionGap,
    closureEligible,
    unverifiedActions,
    errors,
  };
}

export function groupFailureClasses(reviews, classActionRegistry = {}) {
  const grouped = new Map();
  for (const review of reviews) {
    for (const failureClass of review.failureClasses) {
      const entry = grouped.get(failureClass) ?? {
        failureClass,
        postmortems: [],
        founderRescues: 0,
        detectionGapClasses: new Set(),
      };
      entry.postmortems.push(review.path);
      entry.founderRescues += review.detectionGap.founderRescues ?? 0;
      for (const gap of review.detectionGap.gapClasses) {
        entry.detectionGapClasses.add(gap);
      }
      grouped.set(failureClass, entry);
    }
  }
  return [...grouped.values()]
    .map(entry => {
      const count = entry.postmortems.length;
      const recurring = count >= 2;
      return {
        failureClass: entry.failureClass,
        count,
        recurring,
        postmortems: entry.postmortems.sort(),
        founderRescues: entry.founderRescues,
        detectionGapClasses: [...entry.detectionGapClasses].sort(),
        classAction: classActionRegistry[entry.failureClass] ?? null,
        capabilityExpansionScore:
          count * 3 + entry.founderRescues * 5 + entry.detectionGapClasses.size,
      };
    })
    .sort((left, right) => left.failureClass.localeCompare(right.failureClass));
}

export function findUnownedSystemicControls(reviews) {
  return reviews.flatMap(review =>
    review.controls
      .filter(control => control.issues.length === 0)
      .map(control => ({
        postmortem: review.id,
        path: review.path,
        ...control,
      }))
  );
}

export function buildReviewReport({
  documents,
  issueAudit = {},
  classActionRegistry = {},
  generatedAt = new Date(),
  mirrors = {},
  mutations = [],
}) {
  const reviews = documents.map(document =>
    reviewPostmortem(document, issueAudit)
  );
  const failureClasses = groupFailureClasses(reviews, classActionRegistry);
  const recurringWithoutAction = failureClasses
    .filter(item => item.recurring && !item.classAction)
    .map(item => item.failureClass);
  const capabilityExpansionRanking = failureClasses
    .filter(item => item.recurring)
    .sort(
      (left, right) =>
        right.capabilityExpansionScore - left.capabilityExpansionScore ||
        left.failureClass.localeCompare(right.failureClass)
    )
    .map((item, index) => ({
      rank: index + 1,
      failureClass: item.failureClass,
      score: item.capabilityExpansionScore,
      issue: item.classAction?.issue ?? null,
      feeds: 'JOV-5817',
    }));
  const target = reviews.find(
    item => item.id === '2026-09-26-production-freeze'
  );
  const targetMirror = target ? mirrors[target.path] : null;
  const verification = {
    kind: 'production-equivalent-injection',
    target: target?.path ?? null,
    templateReviewPassed: target?.errors.length === 0,
    actionIssueAuditPassed:
      target?.actions.every(issue =>
        target.issueAudit[issue]?.labels?.includes('postmortem-action')
      ) ?? false,
    patternReviewPassed: recurringWithoutAction.length === 0,
    gbrainReadbackPassed:
      targetMirror?.status === 'mirrored' || targetMirror?.status === 'current',
  };
  return {
    schema: REPORT_SCHEMA,
    generatedAt: generatedAt.toISOString(),
    owner: 'Summer',
    sourceIssue: 'JOV-6690',
    detectionCompiler: 'JOV-7084',
    bottleneckRanking: 'JOV-5817',
    summary: {
      postmortems: reviews.length,
      reviewed: reviews.filter(item => item.status !== 'draft').length,
      recurringFailureClasses: failureClasses.filter(item => item.recurring)
        .length,
      recurringWithoutAction,
      closureEligible: reviews
        .filter(item => item.closureEligible)
        .map(item => item.id),
      founderRescues: reviews.reduce(
        (total, item) => total + (item.detectionGap.founderRescues ?? 0),
        0
      ),
    },
    verification: {
      ...verification,
      status: Object.values(verification)
        .filter(value => typeof value === 'boolean')
        .every(Boolean)
        ? 'verified'
        : 'incomplete',
    },
    postmortems: reviews,
    failureClasses,
    capabilityExpansionRanking,
    mirrors,
    mutations,
  };
}

export function readPostmortemDocuments(repoRoot = REPO_ROOT) {
  const directory = resolve(repoRoot, 'docs/postmortems');
  return readdirSync(directory)
    .filter(name => POSTMORTEM_FILE_RE.test(name))
    .sort()
    .map(name => ({
      path: `docs/postmortems/${name}`,
      source: readFileSync(resolve(directory, name), 'utf8'),
    }));
}

export function readClassActionRegistry(repoRoot = REPO_ROOT) {
  const path = resolve(repoRoot, 'docs/postmortems/failure-class-actions.json');
  if (!existsSync(path)) return {};
  const parsed = JSON.parse(readFileSync(path, 'utf8'));
  return Object.fromEntries(
    (parsed.actions ?? []).map(action => [action.failureClass, action])
  );
}

async function linearGraphql(query, variables, apiKey, fetchImpl = fetch) {
  const response = await fetchImpl('https://api.linear.app/graphql', {
    method: 'POST',
    headers: { authorization: apiKey, 'content-type': 'application/json' },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(15_000),
  });
  const body =
    /** @type {{ errors?: unknown[], data?: Record<string, any> }} */ (
      await response.json()
    );
  if (!response.ok || body.errors?.length) {
    throw new Error(`Linear request failed (${response.status})`);
  }
  return body.data;
}

export async function fetchLinearIssueAudit(
  identifiers,
  apiKey,
  fetchImpl = fetch
) {
  const ids = unique(identifiers).filter(id => /^JOV-\d+$/u.test(id));
  if (ids.length === 0) return {};
  const fields = ids
    .map(
      (identifier, index) =>
        `i${index}: issue(id: "${identifier}") { id identifier title url state { name type } labels { nodes { id name } } }`
    )
    .join('\n');
  const data = await linearGraphql(
    `query PostmortemActionAudit { ${fields} }`,
    {},
    apiKey,
    fetchImpl
  );
  return Object.fromEntries(
    Object.values(data ?? {})
      .filter(Boolean)
      .map(issue => [
        issue.identifier,
        {
          id: issue.id,
          identifier: issue.identifier,
          title: issue.title,
          url: issue.url,
          state: issue.state?.name ?? 'Unknown',
          stateType: issue.state?.type ?? 'unknown',
          labels: issue.labels?.nodes?.map(label => label.name).sort() ?? [],
          labelIds: issue.labels?.nodes?.map(label => label.id) ?? [],
        },
      ])
  );
}

export async function ensurePostmortemActionLabels({
  issueAudit,
  apiKey,
  fetchImpl = fetch,
}) {
  const label = await findLinearLabelId({
    name: 'postmortem-action',
    apiKey,
    fetchImpl,
  });
  if (!label.ok || !label.id) {
    throw new Error('Linear postmortem-action label is unavailable');
  }
  const mutations = [];
  for (const issue of Object.values(issueAudit)) {
    if (issue.labels.includes('postmortem-action')) continue;
    const labelIds = unique([...issue.labelIds, label.id]);
    const data = await linearGraphql(
      `mutation LabelPostmortemAction($id: String!, $labelIds: [String!]) {
        issueUpdate(id: $id, input: { labelIds: $labelIds }) {
          success issue { identifier url }
        }
      }`,
      { id: issue.id, labelIds },
      apiKey,
      fetchImpl
    );
    if (!data?.issueUpdate?.success) {
      throw new Error(`Linear label update failed for ${issue.identifier}`);
    }
    mutations.push({
      kind: 'linear-label',
      issue: issue.identifier,
      label: 'postmortem-action',
      readbackRequired: true,
    });
  }
  return mutations;
}

function classIssueDescription(group) {
  return [
    '## Failure class',
    '',
    `\`${group.failureClass}\` recurs across ${group.count} post-mortems:`,
    ...group.postmortems.map(path => `- \`${path}\``),
    '',
    '## Class-level control',
    '',
    'Define one detector/invariant for every similar surface, register the originating incidents in the JOV-7084 replay corpus, and route bounded remediation through existing owners. This issue owns the class, not one incident.',
    '',
    '## Done when',
    '',
    '- The DetectionGap registry names signals, freshness, surfaces, classifier, owner/remediator, escalation, replay fixtures, and blind spots.',
    '- Historical deliberate-red replays fail and at least one healthy control passes.',
    '- A real or injected production-equivalent event is observed firing through Summer before closure.',
    '- Recurrence and founder-rescue counts feed JOV-5817 capability-expansion ranking.',
    '',
    'Related: JOV-6690, JOV-7084.',
    '',
    `<!-- postmortem-class-fingerprint:${group.failureClass} -->`,
  ].join('\n');
}

export async function ensureMissingControlIssues({
  reviews,
  apiKey,
  fetchImpl = fetch,
}) {
  const missing = findUnownedSystemicControls(reviews);
  if (missing.length === 0) return [];
  const label = await findLinearLabelId({
    name: 'postmortem-action',
    apiKey,
    fetchImpl,
  });
  if (!label.ok || !label.id) {
    throw new Error('Linear postmortem-action label is unavailable');
  }
  const mutations = [];
  for (const control of missing) {
    const fingerprint = `[pm-action:${control.postmortem}:${control.index}]`;
    const result = await upsertLinearIssueByTitleFingerprint({
      fingerprint,
      title: `${fingerprint} ${control.text.slice(0, 80)}`,
      description: [
        '## Missing post-mortem control owner',
        '',
        `Source: \`${control.path}\`, systemic control ${control.index}.`,
        '',
        control.text,
        '',
        '## Done when',
        '',
        '- The post-mortem links this issue from the control and action table.',
        '- The generalized detector/invariant is verified by a real or injected production-equivalent event.',
        '- The live receipt is recorded before the post-mortem advances beyond reviewed.',
        '',
        'Related: JOV-6690, JOV-7084.',
        '',
        `<!-- postmortem-action-fingerprint:${control.postmortem}:${control.index} -->`,
      ].join('\n'),
      priority: 2,
      createLabelIds: [label.id],
      keepLabelIds: [label.id],
      labelKey: `postmortem-action-${control.postmortem}-${control.index}`,
      apiKey,
      fetchImpl,
    });
    if (!result.ok) {
      throw new Error(
        `Linear control issue upsert failed for ${control.postmortem}:${control.index}`
      );
    }
    mutations.push({
      kind: 'control-issue',
      postmortem: control.postmortem,
      control: control.index,
      action: result.action,
      issue: result.identifier,
      url: result.url,
    });
  }
  return mutations;
}

export async function ensureRecurringClassIssues({
  groups,
  classActionRegistry,
  apiKey,
  fetchImpl = fetch,
}) {
  const missing = groups.filter(
    group => group.recurring && !classActionRegistry[group.failureClass]
  );
  if (missing.length === 0) return [];
  const labels = [];
  for (const name of ['postmortem-action', 'quality-gap']) {
    const found = await findLinearLabelId({ name, apiKey, fetchImpl });
    if (!found.ok || !found.id) {
      throw new Error(`Linear ${name} label is unavailable`);
    }
    labels.push(found.id);
  }
  const mutations = [];
  for (const group of missing) {
    const fingerprint = `[pm-class:${group.failureClass}]`;
    const result = await upsertLinearIssueByTitleFingerprint({
      fingerprint,
      title: `${fingerprint} Failure-class hardening: ${group.failureClass}`,
      description: classIssueDescription(group),
      priority: 2,
      createLabelIds: labels,
      keepLabelIds: labels,
      labelKey: `postmortem-class-${group.failureClass}`,
      apiKey,
      fetchImpl,
    });
    if (!result.ok) {
      throw new Error(
        `Linear class issue upsert failed for ${group.failureClass}`
      );
    }
    mutations.push({
      kind: 'class-issue',
      failureClass: group.failureClass,
      action: result.action,
      issue: result.identifier,
      url: result.url,
    });
  }
  return mutations;
}

function mcpMessages(raw) {
  return String(raw)
    .split(/\r?\n/)
    .filter(line => line.startsWith('data: '))
    .map(line => JSON.parse(line.slice(6)));
}

function mcpTexts(messages) {
  return messages.flatMap(message =>
    (message.result?.content ?? [])
      .filter(item => item.type === 'text')
      .map(item => item.text)
  );
}

export async function gbrainCall(
  name,
  args,
  {
    apiUrl = process.env.GBRAIN_API_URL ?? process.env.GBRAIN_MCP_URL,
    apiKey = process.env.GBRAIN_API_KEY ?? process.env.MCP_GBRAIN_API_KEY,
    fetchImpl = fetch,
  } = {}
) {
  if (!apiUrl || !apiKey) return { ok: false, reason: 'unconfigured' };
  const endpoint = apiUrl.endsWith('/mcp') ? apiUrl : `${apiUrl}/mcp`;
  let response;
  try {
    response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: {
        accept: 'application/json, text/event-stream',
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name, arguments: args },
      }),
      signal: AbortSignal.timeout(120_000),
    });
  } catch {
    return { ok: false, reason: 'network' };
  }
  const raw = await response.text();
  if (!response.ok) return { ok: false, reason: `http-${response.status}` };
  try {
    const messages = response.headers
      .get('content-type')
      ?.includes('text/event-stream')
      ? mcpMessages(raw)
      : [JSON.parse(raw)];
    const texts = mcpTexts(messages);
    const toolError = messages.some(message => message.result?.isError);
    const bodyError = texts.some(text => {
      try {
        return Boolean(JSON.parse(text).error);
      } catch {
        return false;
      }
    });
    if (toolError || bodyError) {
      return { ok: false, reason: 'tool-error', texts };
    }
    return { ok: true, texts };
  } catch {
    return { ok: false, reason: 'malformed-response' };
  }
}

export async function mirrorPostmortem(document, options = {}) {
  const meta = parseFrontmatter(document.source) ?? {};
  const slug = meta.gbrain;
  if (typeof slug !== 'string') {
    return { status: 'blocked', reason: 'missing-slug' };
  }
  const digest = createHash('sha256').update(document.source).digest('hex');
  const marker = `gbrain-mirror-source-sha256:${digest}`;
  const existing = await gbrainCall('get_page', { slug }, options);
  if (existing.ok && existing.texts.some(text => text.includes(marker))) {
    return { status: 'current', slug, digest };
  }
  const content = `${document.source.trimEnd()}\n\nMirror receipt: \`${marker}\`\n`;
  const written = await gbrainCall('put_page', { slug, content }, options);
  if (!written.ok) {
    return { status: 'buffered', slug, digest, reason: written.reason };
  }
  const readback = await gbrainCall('get_page', { slug }, options);
  if (!readback.ok || !readback.texts.some(text => text.includes(marker))) {
    return {
      status: 'buffered',
      slug,
      digest,
      reason: readback.reason ?? 'readback-mismatch',
    };
  }
  return { status: 'mirrored', slug, digest, readbackVerified: true };
}

function parseArgs(argv) {
  const args = { apply: false, compact: false, mirror: false };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--apply') args.apply = true;
    else if (value === '--compact') args.compact = true;
    else if (value === '--mirror') args.mirror = true;
    else if (value.startsWith('--')) args[value.slice(2)] = argv[++index];
  }
  return args;
}

async function main() {
  assertEventDrivenLearning();
  const args = parseArgs(process.argv.slice(2));
  const repoRoot = args.root ? resolve(args.root) : REPO_ROOT;
  const documents = readPostmortemDocuments(repoRoot);
  const classActionRegistry = readClassActionRegistry(repoRoot);
  let actionIds = unique([
    ...documents.flatMap(document => {
      const meta = parseFrontmatter(document.source) ?? {};
      return Array.isArray(meta.actions) ? meta.actions : [];
    }),
    ...Object.values(classActionRegistry).map(action => action.issue),
  ]);
  const apiKey = process.env.LINEAR_API_KEY;
  let issueAudit = args.audit
    ? JSON.parse(readFileSync(resolve(args.audit), 'utf8'))
    : {};
  const mutations = args.mutations
    ? JSON.parse(readFileSync(resolve(args.mutations), 'utf8'))
    : [];
  if (!args.audit && apiKey) {
    issueAudit = await fetchLinearIssueAudit(actionIds, apiKey);
  }
  let report = buildReviewReport({
    documents,
    issueAudit,
    classActionRegistry,
    generatedAt: args.now ? new Date(args.now) : new Date(),
  });
  if (args.apply && apiKey) {
    mutations.push(
      ...(await ensurePostmortemActionLabels({ issueAudit, apiKey })),
      ...(await ensureMissingControlIssues({
        reviews: report.postmortems,
        apiKey,
      })),
      ...(await ensureRecurringClassIssues({
        groups: report.failureClasses,
        classActionRegistry,
        apiKey,
      }))
    );
    for (const mutation of mutations) {
      if (mutation.kind !== 'class-issue' || !mutation.issue) continue;
      classActionRegistry[mutation.failureClass] = {
        issue: mutation.issue,
        url: mutation.url,
      };
    }
    actionIds = unique([
      ...actionIds,
      ...mutations
        .filter(mutation => mutation.kind === 'class-issue')
        .map(mutation => mutation.issue),
    ]);
    issueAudit = await fetchLinearIssueAudit(actionIds, apiKey);
  } else if (args.apply && !apiKey) {
    mutations.push({
      kind: 'linear',
      action: 'buffered',
      reason: 'unconfigured',
    });
  }
  const mirrors = {};
  if (args.mirror) {
    const mirrorDocuments = args.only
      ? documents.filter(document => document.path.endsWith(args.only))
      : documents;
    for (const document of mirrorDocuments) {
      mirrors[document.path] = await mirrorPostmortem(document);
    }
  }
  report = buildReviewReport({
    documents,
    issueAudit,
    classActionRegistry,
    generatedAt: args.now ? new Date(args.now) : new Date(),
    mirrors,
    mutations,
  });
  const output = `${JSON.stringify(report, null, args.compact ? 0 : 2)}\n`;
  if (args.out) writeFileSync(resolve(args.out), output);
  process.stdout.write(output);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    process.stderr.write(`postmortem-review: ${error.message}\n`);
    process.exitCode = 1;
  });
}
