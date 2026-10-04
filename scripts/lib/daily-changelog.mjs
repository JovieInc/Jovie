/**
 * Daily changelog digest evaluator (JOV-5762).
 *
 * Publishes at most one curated public digest per UTC day, sourced only from
 * typed `daily-changelog-source/v1` receipts. A source is eligible only when a
 * merged PR's exact merge SHA passed a successful Production Controller
 * generation, shipped in an immutable deployment, and reads back live from
 * public build-info. `merged`, `CI green` and `deployed` are never synonyms
 * for `available`; PR titles are never input copy.
 *
 * Durable record: a date-keyed `## [YYYY-MM-DD]` heading in CHANGELOG.md with
 * a hidden `daily-changelog-receipt/v1` HTML comment binding the window,
 * sorted source receipt IDs, merge SHAs, deployment identities, first-public
 * timestamps, content hash and evaluator/model versions. The heading is
 * distinct from CalVer release headings: `version:check` and
 * `version:stamp` only match `YY.M.PATCH`, and the web parser marks these
 * records `kind: 'daily'` so public surfaces emit date permalinks without a
 * fake `v` prefix.
 */

import { createHash } from 'node:crypto';

export const DAILY_SOURCE_SCHEMA = 'daily-changelog-source/v1';
export const DAILY_RECEIPT_SCHEMA = 'daily-changelog-receipt/v1';
export const DAILY_EVALUATOR_VERSION = 'daily-changelog-eval/2';
export const DAILY_MAX_BULLETS = 3;
export const DAILY_FRESHNESS_SLA_MS = 25 * 60 * 60 * 1000;

export const DAILY_EXCLUSION_REASONS = Object.freeze([
  'internal',
  'duplicate-outcome',
  'unavailable',
  'unsafe',
  'ambiguous',
  'failed-validation',
  'malformed',
]);

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SHA_RE = /^[0-9a-f]{40}$/;
const OUTCOME_KEY_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ENTRY_ID_RE = /^customer-update:[a-z0-9]+(?:-[a-z0-9]+)*$/;
const FRAGMENT_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const NUMBER_TOKEN_RE = /\d[\d.,%x-]*/g;
const RECEIPT_COMMENT_RE =
  /<!--\s*daily-changelog-receipt\/v1\s+(\{[\s\S]*?\})\s*-->/g;
const DIGEST_SECTIONS = Object.freeze(['Added', 'Changed', 'Fixed', 'Removed']);

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function isIsoDate(value) {
  return typeof value === 'string' && ISO_DATE_RE.test(value);
}

function isIsoInstant(value) {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

const SAFE_ACTION_HOSTS = new Set(['jov.ie', 'docs.jov.ie']);

/**
 * Customer next-step destinations stay first-party: an internal path or
 * https on jov.ie/docs.jov.ie. Everything else fails closed (JOV-7493).
 * Kept in parity with apps/web/lib/changelog-parser.ts.
 */
export function isSafeActionHref(href) {
  if (typeof href !== 'string') return false;
  if (/^\/(?!\/)\S*$/.test(href)) return true;
  try {
    const url = new URL(href);
    return (
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      !url.port &&
      SAFE_ACTION_HOSTS.has(url.hostname)
    );
  } catch {
    return false;
  }
}

function isStringArray(value) {
  return (
    Array.isArray(value) &&
    value.every(item => typeof item === 'string' && item.trim().length > 0)
  );
}

/** UTC window [00:00:00Z, next 00:00:00Z) for a YYYY-MM-DD key. */
export function dailyWindow(windowKey) {
  if (!isIsoDate(windowKey)) return null;
  const start = Date.parse(`${windowKey}T00:00:00Z`);
  const end = start + 24 * 60 * 60 * 1000;
  if (Number.isNaN(start)) return null;
  return { key: windowKey, start, end };
}

export function dailyWindowKey(instant) {
  return new Date(instant).toISOString().slice(0, 10);
}

export function dailyIdempotencyKey(windowKey) {
  return `daily-changelog/${windowKey}@UTC`;
}

/**
 * Validate one typed source receipt against the availability contract.
 * Returns { eligible, exclusion?, detail? }. Everything malformed fails
 * closed; nothing is silently dropped.
 */
export function validateDailySource(source) {
  if (!isPlainObject(source) || source.schema !== DAILY_SOURCE_SCHEMA) {
    return { eligible: false, exclusion: 'malformed' };
  }
  const id = source.id;
  if (typeof id !== 'string' || !id.trim()) {
    return { eligible: false, exclusion: 'malformed' };
  }
  const fail = (exclusion, detail) => ({ eligible: false, exclusion, detail });

  if (source.flags?.includes('unsafe')) return fail('unsafe', id);
  if (source.flags?.includes('ambiguous')) return fail('ambiguous', id);

  const pr = source.pr;
  if (!isPlainObject(pr) || !SHA_RE.test(pr.mergeSha ?? '')) {
    return fail('malformed', id);
  }
  // PR titles are never input copy: a structured metadata block is required.
  const linear = source.linear;
  if (
    !isPlainObject(linear) ||
    typeof linear.issueId !== 'string' ||
    !isStringArray(linear.approvedClaimIds) ||
    linear.approvedClaimIds.length === 0
  ) {
    return fail('malformed', id);
  }
  if (
    linear.audience !== 'public' ||
    linear.visibility !== 'public' ||
    linear.releaseWorthy !== true
  ) {
    return fail('internal', id);
  }

  const controller = source.controller;
  if (
    !isPlainObject(controller) ||
    controller.status !== 'succeeded' ||
    controller.supersededBy
  ) {
    // draft/prerelease/failed/superseded/unbound generations are ineligible.
    return fail('unavailable', id);
  }

  const deployment = source.deployment;
  // Production coalesces several merges into one deployment. A merge need
  // not equal the deployment head, but the collector must prove ancestry and
  // bind that proof to the exact controller/deployment generation.
  const membership = source.deploymentMembership;
  const deployedMerge =
    deployment?.sha === pr.mergeSha ||
    (membership?.verified === true &&
      membership.mergeSha === pr.mergeSha &&
      membership.headSha === deployment?.sha &&
      controller.sha === deployment?.sha);
  if (
    !isPlainObject(deployment) ||
    typeof deployment.id !== 'string' ||
    !SHA_RE.test(deployment.sha ?? '') ||
    !deployedMerge
  ) {
    return fail('unavailable', id);
  }

  const buildInfo = source.buildInfo;
  if (
    !isPlainObject(buildInfo) ||
    buildInfo.sha !== deployment.sha ||
    !isIsoInstant(buildInfo.observedAt)
  ) {
    // deployed but live readback does not prove the same SHA
    return fail('unavailable', id);
  }

  if (!isIsoInstant(source.firstPublicAt)) {
    return fail('malformed', id);
  }

  return { eligible: true, source };
}

/**
 * Validate one drafted story against approved claims/facts of the eligible
 * sources it maps to. Returns findings[]; empty means the draft may ship.
 */
export function validateDailyDraft(draft, eligibleById) {
  const findings = [];
  if (!isPlainObject(draft)) {
    return [{ rule: 'story-contract', message: 'Draft must be an object.' }];
  }
  const prefix = `Draft ${draft.id || '(unnamed)'}`;
  for (const field of ['id', 'summary']) {
    if (typeof draft[field] !== 'string' || !draft[field].trim()) {
      findings.push({
        rule: 'story-contract',
        message: `${prefix} needs a non-empty ${field}.`,
      });
    }
  }
  if (!DIGEST_SECTIONS.includes(draft.section)) {
    findings.push({
      rule: 'story-contract',
      message: `${prefix} has an invalid section.`,
    });
  }
  if (
    !OUTCOME_KEY_RE.test(draft.id ?? '') ||
    !ENTRY_ID_RE.test(draft.entryId ?? '') ||
    !FRAGMENT_RE.test(draft.slug ?? '') ||
    !Array.isArray(draft.aliases) ||
    draft.aliases.length > 20 ||
    !draft.aliases.every(alias => FRAGMENT_RE.test(alias)) ||
    new Set([draft.slug, ...draft.aliases]).size !== draft.aliases.length + 1 ||
    draft.entryId !== `customer-update:${draft.id}` ||
    draft.slug !== `update-${draft.id}`
  ) {
    findings.push({
      rule: 'story-identity',
      storyId: draft.id,
      message: `${prefix} needs one collision-free immutable entry identity.`,
    });
  }
  if (
    !Array.isArray(draft.sourceIds) ||
    draft.sourceIds.length === 0 ||
    !draft.sourceIds.every(id => typeof id === 'string')
  ) {
    findings.push({
      rule: 'story-contract',
      message: `${prefix} needs a non-empty sourceIds array.`,
    });
    return findings;
  }
  if (
    !Array.isArray(draft.bullets) ||
    draft.bullets.length > DAILY_MAX_BULLETS
  ) {
    findings.push({
      rule: 'story-contract',
      message: `${prefix} must carry at most ${DAILY_MAX_BULLETS} bullets.`,
    });
    return findings;
  }

  if (draft.action !== undefined) {
    const action = draft.action;
    if (
      !isPlainObject(action) ||
      typeof action.label !== 'string' ||
      !action.label.trim() ||
      action.label.length > 80 ||
      /[\r\n<>]/.test(action.label) ||
      !isSafeActionHref(action.href)
    ) {
      findings.push({
        rule: 'story-contract',
        storyId: draft.id,
        message: `${prefix} has an invalid action destination.`,
      });
    }
  }

  const mapped = draft.sourceIds.map(id => eligibleById.get(id));
  for (const [index, source] of mapped.entries()) {
    if (!source) {
      findings.push({
        rule: 'story-source-mismatch',
        sourceId: draft.sourceIds[index],
        storyId: draft.id,
        message: `${prefix} maps ${draft.sourceIds[index]}, which is not an eligible source.`,
      });
    }
  }
  if (mapped.some(source => !source)) return findings;

  const approvedClaims = new Set(
    mapped.flatMap(source => source.linear.approvedClaimIds)
  );
  const approvedFacts = mapped
    .flatMap(source =>
      isStringArray(source.linear.approvedFacts)
        ? source.linear.approvedFacts
        : []
    )
    .join(' ');

  const spans = [{ text: draft.summary, claimIds: draft.claimIds ?? [] }];
  for (const bullet of draft.bullets) {
    if (!isPlainObject(bullet) || typeof bullet.text !== 'string') {
      findings.push({
        rule: 'story-contract',
        storyId: draft.id,
        message: `${prefix} has a malformed bullet.`,
      });
      continue;
    }
    spans.push({ text: bullet.text, claimIds: bullet.claimIds ?? [] });
  }
  for (const span of spans) {
    if (span.claimIds.length === 0) {
      findings.push({
        rule: 'unmapped-claim',
        storyId: draft.id,
        message: `${prefix} has copy with no approved claim mapping.`,
      });
    }
    for (const claimId of span.claimIds) {
      if (!approvedClaims.has(claimId)) {
        findings.push({
          rule: 'unsupported-claim',
          storyId: draft.id,
          message: `${prefix} cites claim ${claimId}, which no mapped source approved.`,
        });
      }
    }
    for (const token of span.text.match(NUMBER_TOKEN_RE) ?? []) {
      if (!approvedFacts.includes(token)) {
        findings.push({
          rule: 'unsupported-fact',
          storyId: draft.id,
          message: `${prefix} states "${token}", which no mapped source approved as a fact.`,
        });
      }
    }
  }
  return findings;
}

/**
 * Evaluate one UTC window. `sources` are typed receipts; `drafts` are the
 * model-written stories. `processedIds` are source IDs already consumed by an
 * earlier published digest (persisted via hidden receipts, never the clock).
 */
export function evaluateDailyWindow({
  windowKey,
  sources = [],
  drafts = [],
  processedIds = [],
  promptVersion = 'daily-changelog-prompt/1',
  evaluatedAt = null,
  modelReceipt = null,
}) {
  const window = dailyWindow(windowKey);
  const evaluated =
    evaluatedAt && !Number.isNaN(Date.parse(evaluatedAt))
      ? evaluatedAt
      : new Date().toISOString();
  const findings = [];
  if (!window) {
    findings.push({
      rule: 'window-contract',
      message: `Invalid UTC window key "${windowKey}".`,
    });
  }
  const processed = new Set(processedIds);
  const eligibleById = new Map();
  const exclusions = [];
  const seenOutcomes = new Map();
  const alreadyProcessed = [];

  for (const source of sources) {
    const verdict = validateDailySource(source);
    if (!verdict.eligible) {
      exclusions.push({
        sourceId: typeof source?.id === 'string' ? source.id : '',
        reason: verdict.exclusion,
      });
      continue;
    }
    const firstPublic = Date.parse(source.firstPublicAt);
    if (window && firstPublic >= window.end) {
      exclusions.push({ sourceId: source.id, reason: 'unavailable' });
      continue;
    }
    if (processed.has(source.id)) {
      alreadyProcessed.push(source.id);
      continue;
    }
    const outcomeKey = source.outcomeKey ?? source.id;
    if (seenOutcomes.has(outcomeKey)) {
      exclusions.push({ sourceId: source.id, reason: 'duplicate-outcome' });
      continue;
    }
    seenOutcomes.set(outcomeKey, source.id);
    eligibleById.set(source.id, {
      ...source,
      lateArrival: window ? firstPublic < window.start : false,
    });
  }

  const storyIds = new Set();
  const usedSourceIds = new Set();
  for (const draft of drafts) {
    for (const finding of validateDailyDraft(draft, eligibleById)) {
      findings.push(finding);
    }
    if (!isPlainObject(draft) || typeof draft.id !== 'string') continue;
    if (storyIds.has(draft.id)) {
      findings.push({
        rule: 'duplicate-story-id',
        storyId: draft.id,
        message: `Draft ${draft.id} appears more than once.`,
      });
    }
    storyIds.add(draft.id);
    const draftSourceIds = Array.isArray(draft.sourceIds)
      ? draft.sourceIds
      : [];
    for (const sourceId of draftSourceIds) {
      if (usedSourceIds.has(sourceId)) {
        findings.push({
          rule: 'duplicate-source-use',
          sourceId,
          message: `Source ${sourceId} is consumed by more than one story.`,
        });
      }
      usedSourceIds.add(sourceId);
    }
  }
  for (const sourceId of eligibleById.keys()) {
    if (!usedSourceIds.has(sourceId)) {
      findings.push({
        rule: 'unmapped-eligible-source',
        sourceId,
        message: `Eligible source ${sourceId} has no story; it needs one or a typed exclusion.`,
      });
    }
  }

  const eligibleSourceIds = [...eligibleById.keys()].sort();
  const stories = drafts.map(draft => ({
    id: draft.id,
    entryId: draft.entryId,
    slug: draft.slug,
    aliases: [...(Array.isArray(draft.aliases) ? draft.aliases : [])],
    section: draft.section,
    summary: draft.summary,
    bullets: (Array.isArray(draft.bullets) ? draft.bullets : [])
      .filter(isPlainObject)
      .map(bullet => bullet.text),
    sourceIds: (Array.isArray(draft.sourceIds) ? draft.sourceIds : []).sort(),
    claimIds: [
      ...new Set([
        ...(Array.isArray(draft.claimIds) ? draft.claimIds : []),
        ...(Array.isArray(draft.bullets) ? draft.bullets : [])
          .filter(isPlainObject)
          .flatMap(bullet =>
            Array.isArray(bullet.claimIds) ? bullet.claimIds : []
          ),
      ]),
    ].sort(),
    lateArrival: (Array.isArray(draft.sourceIds) ? draft.sourceIds : []).some(
      id => eligibleById.get(id)?.lateArrival === true
    ),
    ...(draft.action !== undefined ? { action: draft.action } : {}),
  }));
  stories.sort((a, b) => a.id.localeCompare(b.id));

  const eligibleSources = eligibleSourceIds.map(id => eligibleById.get(id));
  const receipt = {
    schema: DAILY_RECEIPT_SCHEMA,
    window,
    idempotencyKey: dailyIdempotencyKey(windowKey),
    contentKey: sha256(
      JSON.stringify(eligibleSourceIds) +
        DAILY_EVALUATOR_VERSION +
        promptVersion
    ),
    evaluatedAt: evaluated,
    evaluatorVersion: DAILY_EVALUATOR_VERSION,
    promptVersion,
    sourceReceiptIds: eligibleSourceIds,
    mergeShas: eligibleSources.map(source => source.pr.mergeSha).sort(),
    deployments: eligibleSources
      .map(source => ({ id: source.deployment.id, sha: source.deployment.sha }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    firstPublicAt: Object.fromEntries(
      eligibleSources.map(source => [source.id, source.firstPublicAt])
    ),
    lateArrivals: eligibleSources
      .filter(source => source.lateArrival)
      .map(source => source.id),
    exclusions: exclusions.sort((a, b) => a.sourceId.localeCompare(b.sourceId)),
    alreadyProcessed: alreadyProcessed.sort(),
    model: modelReceipt,
  };

  return {
    schema: DAILY_RECEIPT_SCHEMA,
    window,
    idempotencyKey: receipt.idempotencyKey,
    contentKey: receipt.contentKey,
    evaluatedAt: evaluated,
    noChange: eligibleSourceIds.length === 0,
    passed: findings.length === 0 && window !== null,
    findings,
    stories,
    exclusions: receipt.exclusions,
    receipt,
  };
}

/**
 * Render the CHANGELOG.md block for a passing evaluation. Digests contain no
 * `[internal]` entries and no fake `v` prefix: the heading is the date key.
 */
export function renderDailyDigest(result) {
  if (!result.passed || result.noChange) return '';
  const lines = [`## [${result.window.key}]`, ''];
  const lead = result.stories[0];
  if (lead) {
    lines.push(`> ${lead.summary}`, '');
  }
  const bySection = new Map();
  for (const story of result.stories) {
    const list = bySection.get(story.section) ?? [];
    list.push(story);
    bySection.set(story.section, list);
  }
  for (const section of DIGEST_SECTIONS) {
    const stories = bySection.get(section);
    if (!stories) continue;
    lines.push(`### ${section}`, '');
    for (const story of stories) {
      // A summary-only lead must still be a public entry. Both parsers hide
      // releases with no bullets, even when their blockquote has real copy.
      lines.push(`- ${story.summary}`);
      for (const bullet of story.bullets) lines.push(`- ${bullet}`);
    }
    lines.push('');
  }
  const receipt = { ...result.receipt, contentHash: '' };
  receipt.contentHash = sha256(lines.join('\n'));
  lines.push(
    `<!-- daily-changelog-receipt/v1 ${JSON.stringify(receipt)} -->`,
    ''
  );
  return lines.join('\n');
}

/** Extract hidden receipts; malformed comments fail closed via `malformed`. */
export function extractDailyReceipts(markdown) {
  const receipts = [];
  for (const match of markdown.matchAll(RECEIPT_COMMENT_RE)) {
    try {
      receipts.push(JSON.parse(match[1]));
    } catch {
      receipts.push({ malformed: true, raw: match[1].slice(0, 80) });
    }
  }
  return receipts;
}

/** Source IDs already consumed by persisted digest receipts. */
export function processedDailySourceIds(markdown) {
  const ids = new Set();
  for (const receipt of extractDailyReceipts(markdown)) {
    for (const id of receipt.sourceReceiptIds ?? []) ids.add(id);
  }
  return ids;
}

/**
 * Insert (or idempotently replace) a digest block. Placement: immediately
 * before `## [Unreleased]` when present — digests are newer than Unreleased
 * notes and `version:stamp` still promotes Unreleased above them — otherwise
 * before the first `## ` heading, else appended.
 */
export function insertDailyDigest(markdown, block, windowKey) {
  const heading = `## [${windowKey}]`;
  const lines = markdown.split('\n');
  const existing = lines.findIndex(line => line === heading);
  if (existing !== -1) {
    let end = lines.length;
    for (let i = existing + 1; i < lines.length; i++) {
      if (/^## /.test(lines[i])) {
        end = i;
        break;
      }
    }
    const next = [...lines.slice(0, existing), ...lines.slice(end)];
    return insertDailyDigest(next.join('\n'), block, windowKey);
  }
  const unreleasedIndex = lines.findIndex(line =>
    /^##\s*\[Unreleased\]\s*$/.test(line)
  );
  const firstHeading = lines.findIndex(line => /^## /.test(line));
  const insertAt =
    unreleasedIndex !== -1
      ? unreleasedIndex
      : firstHeading !== -1
        ? firstHeading
        : lines.length;
  const next = [...lines];
  next.splice(insertAt, 0, block.trimEnd(), '');
  return next.join('\n');
}

/**
 * Freshness gate (JOV-5762): any eligible, unconsumed receipt older than the
 * 25h SLA fails red until a terminal receipt exists. `merged`/`deployed`
 * receipts that never went public are excluded by validation, not by age.
 */
export function checkDailyFreshness({
  sources = [],
  processedIds = [],
  now,
  slaMs = DAILY_FRESHNESS_SLA_MS,
}) {
  const processed = new Set(processedIds);
  const nowMs = Number.isNaN(Date.parse(now)) ? Date.now() : Date.parse(now);
  const stale = [];
  for (const source of sources) {
    const verdict = validateDailySource(source);
    if (!verdict.eligible || processed.has(source.id)) continue;
    const age = nowMs - Date.parse(source.firstPublicAt);
    if (age > slaMs) {
      stale.push({ sourceId: source.id, firstPublicAt: source.firstPublicAt });
    }
  }
  return {
    passed: stale.length === 0,
    slaMs,
    stale: stale.sort((a, b) => a.sourceId.localeCompare(b.sourceId)),
  };
}
