import { createHash } from 'node:crypto';

export const RECOVERY_RECEIPT_SCHEMA = 'jovie-ownerless-recovery/v1';
export const RECOVERY_RECEIPT_MARKER =
  '<!-- bot-comment:ownerless-recovery -->';
export const FLEET_CLOSURE_AUDIT_SCHEMA = 'jovie-pr-fleet-closure-audit/v1';
export const FLEET_CLOSURE_AUDIT_MARKER =
  '<!-- bot-comment:pr-fleet-closure-audit -->';
export const FLEET_REMEDIATION_LEASE_SCHEMA =
  'jovie-pr-fleet-remediation-lease/v1';
export const FLEET_REMEDIATION_LEASE_MARKER =
  '<!-- jovie-pr-fleet-remediation-lease:v1 -->';
const FLEET_REMEDIATION_LEASE_END =
  '<!-- /jovie-pr-fleet-remediation-lease -->';
export const FLEET_CLOSURE_LEASE_STALE_MS = 5 * 60_000;
export const FLEET_CLOSURE_COUNT_KEYS = Object.freeze(
  'draft|ready/green|native queue|remediating|blocked|conflict/unstable|ownerless/stalled|superseded'.split(
    '|'
  )
);

const HOLD_LABELS = new Set(
  'blocked|fast|gated|hold|human-review-required|needs-conflict-resolution|needs-human|needs-human-review|needs-manual-rebase|no-auto|queue-deferred|risk:high'.split(
    '|'
  )
);

const MATERIAL_RISK_PATH =
  /(^|\/)(auth|billing|stripe|security|secrets?|credentials?|migrations?|drizzle)(\/|$)|^apps\/web\/app\/api\/|^apps\/web\/lib\/env|^\.github\/workflows\/production-|^scripts\/security\//i;

const FOCUSED_PATHS = Object.freeze([
  {
    lane: 'ci',
    pattern:
      /^\.github\/workflows\/.*(?:ci|test|lint|runner|merge|queue|agent|delivery|canary|workflow|fork|pr-|auto-ready|nightly)/i,
  },
  {
    lane: 'ci',
    pattern:
      /^scripts\/(?:lib\/)?(?:.*(?:ci|test|lint|runner|merge|queue|agent|delivery|canary|workflow|devex|worktree).*)\.(?:mjs|js|ts|py|sh)$/i,
  },
  {
    lane: 'delivery-control',
    pattern:
      /^scripts\/backlog-orchestrator\/(?:delivery-state-machine|admission-disposition|no-unattended-red)\.mjs$/,
  },
  {
    lane: 'waitlist-canary',
    pattern:
      /^apps\/web\/(?:tests\/(?:e2e|unit)\/.*(?:waitlist|canary)|tests\/e2e\/utils\/.*(?:waitlist|canary)|playwright\.synthetic\.config\.ts)/i,
  },
  {
    lane: 'devex',
    pattern:
      /^(?:\.node-version|\.nvmrc|biome\.jsonc?|pnpm-workspace\.yaml|turbo\.json|tsconfig\.json)$/,
  },
  {
    lane: 'docs-tests',
    pattern:
      /^(?:docs\/.*(?:CI|DEVEX|TEST|WORKFLOW|QUEUE|DELIVERY|CANARY)|scripts\/(?:lib\/__tests__|tests)\/.*(?:ci|gh-retry|workflow|queue|merge|agent|delivery|canary|devex|worktree)|apps\/web\/tests\/unit\/ci\/)/i,
  },
]);

const MATERIAL_RISK_CHANGE =
  /(?:secrets?\.|private[-_ ]key|api[-_ ]key|credential|(?:actions|checks|contents|deployments|id-token|issues|packages|pull-requests|security-events|statuses):\s*write|permissions:\s*write-all|pull_request_target|\b(?:GH_TOKEN|GITHUB_TOKEN)\b|\bgh\s+(?:api|pr|repo|run|workflow)\b|\bgit\s+(?:push|tag|reset|clean)\b|\b(?:curl|wget|nc|sudo|chmod|chown)\b|\bfind\b.*\s-delete\b|drop\s+table|delete\s+from|\b(?:rm\s+-rf|rmSync|unlink|truncate)\b|\b(?:fetch|https?\.request)\s*\(|continue-on-error:\s*true|\|\|\s*true|\b(?:bypass|skip)[-_ ]?(?:ci|check|gate)|production\s+(?:deploy|promotion)|--force\b|^[-+]\s*(?:uses:|run:.*(?:scripts\/|\.\/)))/im;

const SHA = /^[0-9a-f]{40}$/;
const LINEAR_IDENTIFIER = /\b[A-Z][A-Z0-9]+-\d+\b/g;
const IN_PROGRESS_STATES = new Set(['in progress', 'rework']);
const REMEDIATING_STATES = new Set(['todo', ...IN_PROGRESS_STATES]);
const TERMINAL_STATES = new Set(
  'done|completed|canceled|cancelled|closed|duplicate'.split('|')
);

function safeWorkflowChange(lines) {
  const settings = new Map();
  for (const line of lines.filter(line => !/^[-+]\s*#/.test(line))) {
    const match = line.match(
      /^([-+])\s*(timeout-minutes|max-parallel|retention-days|cancel-in-progress):\s*(\d+|true|false)$/
    );
    if (!match) return false;
    const values = settings.get(match[2]) ?? {};
    if (values[match[1]]) return false;
    values[match[1]] = match[3];
    settings.set(match[2], values);
  }
  return [...settings].every(([key, values]) => {
    if (key === 'cancel-in-progress')
      return values['-'] === 'false' && values['+'] === 'true';
    return Number(values['+']) <= Number(values['-']);
  });
}

export function hasCompletePatch(file) {
  if (typeof file?.patch !== 'string') return false;
  const changedLines = file.patch
    .split('\n')
    .filter(line => /^[+-](?![+-]{2})/.test(line)).length;
  return changedLines === file.changes;
}

function labelsOf(pr) {
  return (pr?.labels ?? [])
    .map(label => (typeof label === 'string' ? label : label?.name))
    .filter(Boolean)
    .map(label => String(label).toLowerCase());
}

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean).map(String))].sort();
}

function issueIdentifier(issue) {
  return String(issue?.identifier || issue?.key || '')
    .trim()
    .toUpperCase();
}

function issueStateName(issue) {
  return String(issue?.state?.name || issue?.state || '')
    .trim()
    .toLowerCase();
}

function prNumber(pr) {
  const value = Number(pr?.number);
  return Number.isInteger(value) && value > 0 ? value : null;
}

function prHead(pr) {
  return String(pr?.head?.sha || pr?.headRefOid || pr?.headSha || '').trim();
}

function evidenceSha256(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function withEvidenceSha256(value) {
  return { ...value, evidenceSha256: evidenceSha256(value) };
}

function textValues(value, depth = 0) {
  if (depth > 3 || value == null) return [];
  if (typeof value === 'string' || typeof value === 'number')
    return [String(value)];
  const children = Array.isArray(value)
    ? value
    : typeof value === 'object'
      ? Object.values(value)
      : [];
  return children.flatMap(item => textValues(item, depth + 1));
}

const SUPERSESSION_RE = /<!--\s*jovie-supersession:v1(?:\s+([^>]*?))?\s*-->/g;
const SUPERSESSION_ATTR_RE =
  /([A-Za-z][A-Za-z0-9_-]*)=("[^"]*"|'[^']*'|[^\s>]+)/g;
const issueKeyPattern = /^[A-Z][A-Z0-9]+-\d+$/;
const issueCommentBodies = issue =>
  (issue?.comments?.nodes ?? issue?.comments ?? []).map(
    comment => comment?.body ?? comment
  );

function supersessionAttributes(raw) {
  return Object.fromEntries(
    [...String(raw || '').matchAll(SUPERSESSION_ATTR_RE)].map(match => [
      match[1],
      match[2].replace(/^['"]|['"]$/g, ''),
    ])
  );
}

export function parsePrSupersessionMarkers(pr) {
  return [pr?.body, ...issueCommentBodies(pr)]
    .flatMap(value => [...String(value || '').matchAll(SUPERSESSION_RE)])
    .map(match => {
      const attributes = supersessionAttributes(match[1]);
      const owner = String(attributes.owner || '').toUpperCase();
      const replacementValues = String(attributes.replacements || '')
        .split(',')
        .filter(Boolean);
      const replacements = replacementValues.map(value => Number(value));
      const violations = [];
      if (attributes.status !== 'superseded')
        violations.push('supersession-status-invalid');
      if (!issueKeyPattern.test(owner))
        violations.push('supersession-owner-invalid');
      if (
        replacementValues.length === 0 ||
        !replacements.every(value => Number.isInteger(value) && value > 0)
      ) {
        violations.push('supersession-replacements-invalid');
      }
      return {
        status: attributes.status || null,
        owner,
        replacements,
        violations,
      };
    });
}

export function extractLinearIdentifiersFromText(...values) {
  return uniqueSorted(
    values
      .flatMap(value => textValues(value))
      .flatMap(value => value.match(LINEAR_IDENTIFIER) ?? [])
      .map(value => value.toUpperCase())
  );
}

function buildSupersessionIndex(pullRequests, linearIssues) {
  const openPrs = new Set(pullRequests.map(prNumber).filter(Boolean));
  const knownIssues = new Set(
    linearIssues.map(issueIdentifier).filter(Boolean)
  );
  const byPr = new Map();
  for (const pr of pullRequests) {
    const number = prNumber(pr);
    const markers = parsePrSupersessionMarkers(pr);
    if (!number || markers.length === 0) continue;
    const marker = markers[0] ?? {
      status: null,
      owner: '',
      replacements: [],
      violations: [],
    };
    const record = { ...marker, statusValue: marker.status, status: 'invalid' };
    if (markers.length !== 1) record.violations.push('supersession-ambiguous');
    if (marker.owner && !knownIssues.has(marker.owner)) {
      record.violations.push('supersession-owner-unresolved');
    }
    for (const replacement of marker.replacements) {
      if (!openPrs.has(replacement)) {
        record.violations.push('supersession-replacement-missing-open-pr');
      }
    }
    byPr.set(number, record);
  }
  const graph = new Map(
    [...byPr].map(([number, record]) => [number, record.replacements])
  );
  const reaches = (start, target, seen = new Set()) => {
    if (start === target) return true;
    if (seen.has(start)) return false;
    seen.add(start);
    return (graph.get(start) ?? []).some(next => reaches(next, target, seen));
  };
  for (const [number, record] of byPr) {
    if (record.replacements.some(replacement => reaches(replacement, number))) {
      record.violations.push('supersession-cycle');
    }
    record.violations = uniqueSorted(record.violations);
    record.status = record.violations.length === 0 ? 'valid' : 'invalid';
  }
  return byPr;
}

function attachedPullRequestNumbers(issue) {
  return uniqueSorted(
    textValues([
      issue?.attachments?.nodes ?? issue?.attachments,
      issue?.relations?.nodes ?? issue?.relations,
    ]).flatMap(value =>
      [
        ...value.matchAll(
          /(?:github\.com\/JovieInc\/Jovie\/pull\/|\bJovieInc\/Jovie#)(\d+)/gi
        ),
      ].map(match => match[1])
    )
  ).map(Number);
}

const provenanceSources = (map, identifiers) =>
  Object.fromEntries(
    identifiers.map(identifier => [identifier, [...map.get(identifier)].sort()])
  );

function packetIssueIdentifiers(packetMap, number) {
  if (!packetMap || number == null) return [];
  if (Array.isArray(packetMap)) {
    return extractLinearIdentifiersFromText(
      packetMap
        .filter(entry => Number(entry?.pr ?? entry?.number) === number)
        .flatMap(entry => [entry.issue, entry.identifier, entry.linearIssue])
    );
  }
  const direct =
    packetMap[number] ??
    packetMap[String(number)] ??
    packetMap.prs?.[number] ??
    packetMap.prs?.[String(number)];
  return extractLinearIdentifiersFromText(direct);
}

export function resolveCanonicalLinearProvenance(
  pr,
  { linearIssues = [], prPacketMap = {} } = {}
) {
  const number = prNumber(pr);
  const issuesByIdentifier = new Map();
  for (const issue of linearIssues) {
    const identifier = issueIdentifier(issue);
    if (identifier) issuesByIdentifier.set(identifier, issue);
  }
  const sourcesByIdentifier = new Map();
  const add = (identifier, source) => {
    if (!identifier) return;
    const normalized = String(identifier).toUpperCase();
    const sources = sourcesByIdentifier.get(normalized) ?? new Set();
    sources.add(source);
    sourcesByIdentifier.set(normalized, sources);
  };

  for (const identifier of extractLinearIdentifiersFromText(
    pr?.title,
    pr?.body,
    pr?.headRefName,
    pr?.head?.ref,
    pr?.branch,
    pr?.comments
  )) {
    add(identifier, 'explicit-linear-id');
  }
  for (const marker of parsePrSupersessionMarkers(pr)) {
    add(marker.owner, 'supersession-marker-owner');
  }
  for (const issue of linearIssues) {
    if (attachedPullRequestNumbers(issue).includes(number)) {
      add(issueIdentifier(issue), 'exact-pr-attachment');
    }
  }
  for (const identifier of packetIssueIdentifiers(prPacketMap, number)) {
    add(identifier, 'jov-5610-pr-packet');
  }

  const identifiers = uniqueSorted([...sourcesByIdentifier.keys()]);
  const known = identifiers.filter(identifier =>
    issuesByIdentifier.has(identifier)
  );
  if (known.length === 0) {
    return {
      status: 'missing',
      reason:
        identifiers.length === 0
          ? 'missing-linear-provenance'
          : 'linear-provenance-unresolved',
      identifiers,
      sources: provenanceSources(sourcesByIdentifier, identifiers),
    };
  }
  if (known.length > 1) {
    return {
      status: 'ambiguous',
      reason: 'ambiguous-linear-provenance',
      identifiers: known,
      sources: provenanceSources(sourcesByIdentifier, known),
    };
  }
  const identifier = known[0];
  return {
    status: 'owned',
    reason: 'canonical-linear-provenance',
    identifier,
    issue: issuesByIdentifier.get(identifier),
    sources: [...sourcesByIdentifier.get(identifier)].sort(),
  };
}

function leaseIdentifier(value) {
  if (typeof value === 'string') return value.toUpperCase();
  return String(
    [
      'issue',
      'identifier',
      'issueIdentifier',
      'issue_identifier',
      'linearIdentifier',
    ]
      .map(key => value?.[key])
      .find(Boolean) || ''
  )
    .trim()
    .toUpperCase();
}

function normalizeSymphonyState(state, now, staleAfterMs) {
  const unhealthy = reason => ({ healthy: false, reason });
  const raw = state ?? {
    observedAt: now.toISOString(),
    running: [],
    retrying: [],
    blocked: [],
    source: 'unsupplied-symphony-state',
  };
  if (typeof raw !== 'object') return unhealthy('symphony-state-malformed');
  const observedAt = String(raw.observedAt || '').trim();
  const observedMs = Date.parse(observedAt);
  if (!Number.isFinite(observedMs))
    return unhealthy('symphony-state-malformed');
  const ageMs = now.getTime() - observedMs;
  if (ageMs < -30_000 || ageMs >= staleAfterMs)
    return unhealthy('symphony-state-stale');
  const entries = status =>
    new Set(
      uniqueSorted(
        (Array.isArray(raw[status]) ? raw[status] : [])
          .map(item => leaseIdentifier(item))
          .filter(Boolean)
      )
    );
  return {
    healthy: true,
    reason: null,
    observedAt,
    running: entries('running'),
    retrying: entries('retrying'),
    blocked: entries('blocked'),
    source: raw.source || 'official-symphony-state',
  };
}

function hasLiveLease(issue, symphony) {
  const identifier = issueIdentifier(issue);
  return (
    symphony.running?.has(identifier) || symphony.retrying?.has(identifier)
  );
}

export function findOfficialSymphonyLease(
  state,
  identifier,
  { now = new Date(), staleAfterMs = FLEET_CLOSURE_LEASE_STALE_MS } = {}
) {
  if (!state) return { ok: false, reason: 'symphony-state-missing' };
  const symphony = normalizeSymphonyState(state, now, staleAfterMs);
  if (!symphony.healthy) return { ok: false, reason: symphony.reason };
  const issue = String(identifier || '').toUpperCase();
  const stateName = ['running', 'retrying'].find(name =>
    symphony[name].has(issue)
  );
  return {
    ok: Boolean(stateName),
    state: stateName,
    reason: stateName ? undefined : 'symphony-lease-readback-missing',
    source: symphony.source,
    observedAt: symphony.observedAt,
  };
}

function fleetDisplay(pr, labels, hardStops, supersession) {
  if (
    supersession?.status === 'valid' ||
    supersession?.statusValue === 'superseded'
  ) {
    return {
      category: 'superseded',
      reason: `supersession-marker${supersession.status === 'valid' ? '' : '-invalid'}`,
    };
  }
  if (labels.includes('superseded')) {
    return { category: 'superseded', reason: 'legacy-superseded-label' };
  }
  if (pr?.draft === true || pr?.isDraft === true) {
    return { category: 'draft', reason: 'draft' };
  }
  if (hardStops.length > 0) {
    return {
      category: 'blocked',
      reason: `held:${hardStops.sort().join(',')}`,
    };
  }
  if (
    pr?.isInMergeQueue === true ||
    pr?.mergeQueueEntry ||
    pr?.queueState?.queued
  ) {
    return { category: 'native queue', reason: 'native-queue-owned' };
  }
  if (
    pr?.mergeable === false ||
    pr?.mergeable_state === 'dirty' ||
    pr?.mergeStateStatus === 'DIRTY' ||
    pr?.checksPassing === false
  ) {
    return {
      category: 'conflict/unstable',
      reason: 'conflict-or-checks-not-green',
    };
  }
  return null;
}

function snapshotViolations(pullRequests, snapshot, now) {
  const violations = [];
  const push = (reason, extra = {}) =>
    violations.push({
      scope: 'github',
      reason,
      action: 'retry-stable-snapshot',
      ...extra,
    });
  const complete =
    snapshot?.complete ??
    snapshot?.pagination?.complete ??
    (snapshot?.pageInfo?.hasNextPage === undefined
      ? true
      : !snapshot.pageInfo.hasNextPage);
  if (complete !== true) push('github-pagination-truncated');
  const seen = new Set();
  for (const pr of pullRequests) {
    const number = prNumber(pr);
    if (seen.has(number))
      push('github-pagination-duplicate-pr', { pr: number });
    seen.add(number);
  }
  const startedAt = Date.parse(snapshot?.startedAt ?? now.toISOString());
  const completedAt = Date.parse(snapshot?.completedAt ?? now.toISOString());
  if (Number.isFinite(startedAt) && Number.isFinite(completedAt)) {
    for (const pr of pullRequests) {
      const createdAt = Date.parse(pr?.created_at ?? pr?.createdAt ?? '');
      if (
        Number.isFinite(createdAt) &&
        createdAt >= startedAt &&
        createdAt <= completedAt
      ) {
        push('github-pr-created-during-pagination', { pr: prNumber(pr) });
      }
    }
  }
  return violations;
}

function ownershipFor(provenance, symphony) {
  const owned = provenance.status === 'owned';
  const issue = owned ? provenance.identifier : null;
  if (!owned) {
    return { status: 'ownerless/stalled', reason: provenance.reason, issue };
  }
  const state = issueStateName(provenance.issue);
  if (TERMINAL_STATES.has(state)) {
    return {
      status: 'ownerless/stalled',
      reason: 'terminal-linear-issue-open-pr',
      issue,
    };
  }
  if (
    IN_PROGRESS_STATES.has(state) &&
    !hasLiveLease(provenance.issue, symphony)
  ) {
    return {
      status: 'ownerless/stalled',
      reason: 'in-progress-without-live-symphony-lease',
      issue,
    };
  }
  return { status: 'accountable', reason: provenance.reason, issue };
}

function fallbackDisplay(item, provenance) {
  if (item.ownership.status !== 'accountable') {
    return { category: 'ownerless/stalled', reason: item.ownership.reason };
  }
  return REMEDIATING_STATES.has(issueStateName(provenance.issue))
    ? { category: 'remediating', reason: 'linear-active-remediation' }
    : { category: 'ready/green', reason: 'accountable-green-pr' };
}

export function classifyPrFleetClosureItem(
  pr,
  {
    linearIssues = [],
    prPacketMap = {},
    symphonyState = null,
    supersession = null,
    now = new Date(),
    staleAfterMs = FLEET_CLOSURE_LEASE_STALE_MS,
  } = {}
) {
  const labels = labelsOf(pr);
  const hardStops = labels.filter(label => HOLD_LABELS.has(label));
  const head = prHead(pr);
  const number = prNumber(pr);
  const display = fleetDisplay(pr, labels, hardStops, supersession);
  const provenance = resolveCanonicalLinearProvenance(pr, {
    linearIssues,
    prPacketMap,
  });
  const symphony = normalizeSymphonyState(symphonyState, now, staleAfterMs);
  const issue = provenance.status === 'owned' ? provenance.identifier : null;
  const item = {
    pr: number,
    head,
    issue,
    category: display?.category,
    reason: display?.reason,
    supersession: supersession && {
      status: supersession.status,
      owner: supersession.owner,
      replacements: supersession.replacements,
      violations: supersession.violations,
    },
    provenance,
    ownership: ownershipFor(provenance, symphony),
  };
  if (!item.category) Object.assign(item, fallbackDisplay(item, provenance));
  return item;
}

function remediationAction(item) {
  if (item.category === 'native queue') return 'preserve-native-queue-owner';
  if (item.category === 'blocked') return 'preserve-hard-stop-owner';
  if (!item.ownership?.issue) return 'operator-owned-exception';
  return 'emit-linear-remediation-intent';
}

function remediationIntent(item) {
  return {
    schema: FLEET_REMEDIATION_LEASE_SCHEMA,
    pr: item.pr,
    head: item.head,
    issue: item.ownership.issue,
    displayCategory: item.category,
    reason: item.ownership.reason,
    action: 'reattach-remediation-lane',
    consumer: 'symphony-linear-writer',
  };
}

function prFleetViolation(item, reason, action, issue = item.ownership.issue) {
  return {
    scope: 'pull-request',
    pr: item.pr,
    head: item.head,
    issue,
    displayCategory: item.category,
    reason,
    action,
  };
}

export function buildPrFleetClosureAudit({
  repository = 'JovieInc/Jovie',
  pullRequests = [],
  linearIssues = [],
  prPacketMap = {},
  symphonyState = null,
  snapshot = {},
  now = new Date(),
  staleAfterMs = FLEET_CLOSURE_LEASE_STALE_MS,
} = {}) {
  const snapshotRecord = /** @type {Record<string, any>} */ (snapshot ?? {});
  const counts = Object.fromEntries(
    FLEET_CLOSURE_COUNT_KEYS.map(key => [key, 0])
  );
  const ownershipCounts = { accountable: 0, 'ownerless/stalled': 0 };
  const violations = /** @type {Array<Record<string, any>>} */ (
    snapshotViolations(pullRequests, snapshotRecord, now)
  );
  const remediationIntents = [];
  const symphony = normalizeSymphonyState(symphonyState, now, staleAfterMs);
  const supersessions = buildSupersessionIndex(pullRequests, linearIssues);
  if (!symphony.healthy) {
    violations.push({
      scope: 'symphony',
      reason: symphony.reason,
      action: 'reattach-remediation-lane',
    });
  }
  const items = pullRequests.map(pr => {
    const item = classifyPrFleetClosureItem(pr, {
      linearIssues,
      prPacketMap,
      symphonyState,
      supersession: supersessions.get(prNumber(pr)) ?? null,
      now,
      staleAfterMs,
    });
    counts[item.category] += 1;
    ownershipCounts[item.ownership.status] += 1;
    if (item.ownership.status === 'ownerless/stalled') {
      const action = remediationAction(item);
      violations.push(prFleetViolation(item, item.ownership.reason, action));
      if (action === 'emit-linear-remediation-intent') {
        remediationIntents.push(remediationIntent(item));
      }
    }
    for (const reason of item.supersession?.violations ?? []) {
      violations.push(
        prFleetViolation(
          item,
          reason,
          'operator-owned-exception',
          item.supersession.owner || item.issue
        )
      );
    }
    return item;
  });
  const normalized = {
    schema: FLEET_CLOSURE_AUDIT_SCHEMA,
    repository,
    observedAt: now.toISOString(),
    status: violations.length === 0 ? 'healthy' : 'blocked',
    snapshot: {
      startedAt: snapshotRecord?.startedAt ?? null,
      completedAt: snapshotRecord?.completedAt ?? null,
      pullRequests: pullRequests.length,
      paginationComplete: !violations.some(
        violation => violation.reason === 'github-pagination-truncated'
      ),
    },
    symphony: {
      source: symphony.source ?? 'official-symphony-state',
      observedAt: symphony.observedAt ?? null,
      running: symphony.running?.size ?? null,
      retrying: symphony.retrying?.size ?? null,
      blocked: symphony.blocked?.size ?? null,
      healthy: symphony.healthy,
    },
    counts,
    ownershipCounts,
    items,
    violations,
    remediationIntents,
  };
  return withEvidenceSha256(normalized);
}

export function renderPrFleetClosureAudit(receipt) {
  return `${FLEET_CLOSURE_AUDIT_MARKER}\n## PR Fleet Closure Audit\n\n\`\`\`json\n${JSON.stringify(receipt, null, 2)}\n\`\`\``;
}

export function renderFleetClosureRemediationLease(intent) {
  const normalized = withEvidenceSha256({
    schema: FLEET_REMEDIATION_LEASE_SCHEMA,
    pr: intent.pr,
    head: intent.head,
    issue: intent.issue,
    displayCategory: intent.displayCategory,
    reason: intent.reason,
    action: 'reattach-remediation-lane',
    consumer: 'symphony-linear-writer',
    observedAt: intent.observedAt,
  });
  return `${FLEET_REMEDIATION_LEASE_MARKER}\n${JSON.stringify(normalized, null, 2)}\n${FLEET_REMEDIATION_LEASE_END}`;
}

export function parseFleetClosureRemediationLeases(body) {
  return [
    ...String(body || '').matchAll(
      /<!--\s*jovie-pr-fleet-remediation-lease:v1\s*-->([\s\S]*?)<!--\s*\/jovie-pr-fleet-remediation-lease\s*-->/g
    ),
  ]
    .map(match => {
      try {
        const receipt = JSON.parse(match[1]);
        return receipt?.schema === FLEET_REMEDIATION_LEASE_SCHEMA
          ? receipt
          : null;
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

export function hasFleetClosureRemediationLease(issue, intent) {
  return (issue?.comments?.nodes ?? issue?.comments ?? [])
    .flatMap(comment =>
      parseFleetClosureRemediationLeases(comment?.body ?? comment)
    )
    .some(
      receipt =>
        receipt.pr === intent.pr &&
        receipt.head === intent.head &&
        receipt.issue === intent.issue &&
        receipt.reason === intent.reason
    );
}

export function classifyRecoveryFiles(
  files = [],
  patch = '',
  { patchComplete = true } = {}
) {
  if (!Array.isArray(files) || files.length === 0) {
    return { eligible: false, lanes: [], reason: 'changed-files-unavailable' };
  }
  if (patchComplete !== true) {
    return { eligible: false, lanes: [], reason: 'changed-patch-incomplete' };
  }
  const lanes = new Set();
  for (const file of files) {
    if (typeof file !== 'string' || MATERIAL_RISK_PATH.test(file)) {
      return {
        eligible: false,
        lanes: [],
        reason: `material-risk-path:${file}`,
      };
    }
    const match = FOCUSED_PATHS.find(entry => entry.pattern.test(file));
    if (!match) {
      return { eligible: false, lanes: [], reason: `unfocused-path:${file}` };
    }
    if (match.lane !== 'docs-tests') lanes.add(match.lane);
  }
  if (lanes.size === 0) {
    return { eligible: false, lanes: [], reason: 'tests-or-docs-only' };
  }
  const changedLines = String(patch)
    .split('\n')
    .filter(
      line =>
        (line.startsWith('+') && !line.startsWith('+++')) ||
        (line.startsWith('-') && !line.startsWith('---'))
    )
    .map(line => line.trimEnd());
  if (
    files.some(file => /^\.github\/workflows\/.*\.ya?ml$/i.test(file)) &&
    !safeWorkflowChange(changedLines)
  ) {
    return { eligible: false, lanes: [], reason: 'workflow-control-change' };
  }
  if (MATERIAL_RISK_CHANGE.test(changedLines.join('\n'))) {
    return { eligible: false, lanes: [], reason: 'material-risk-change' };
  }
  return {
    eligible: true,
    lanes: [...lanes].sort(),
    reason: 'focused-recovery',
  };
}

export function ownerlessSince(pr, timeline = []) {
  if ((pr?.assignees ?? []).length > 0) return null;
  const ownershipEvents = timeline.filter(event =>
    ['assigned', 'unassigned'].includes(event?.event)
  );
  const last = ownershipEvents.at(-1);
  if (last?.event === 'assigned') return null;
  return last?.created_at ?? pr?.created_at ?? null;
}

export function evaluateRecoveryCandidate({
  pr,
  mainSha,
  compare,
  timeline,
  files,
  patch,
  patchComplete = true,
  containsOpenPrHead = false,
  checksPassing,
  now = Date.now(),
  minimumOwnerlessMs = 60 * 60_000,
}) {
  if (!pr || pr.state !== 'open')
    return { eligible: false, reason: 'not-open' };
  if (pr.base?.ref !== 'main') return { eligible: false, reason: 'stacked-pr' };
  if (pr.head?.repo?.full_name !== pr.base?.repo?.full_name) {
    return { eligible: false, reason: 'fork-pr' };
  }
  if (pr.mergeable !== true || pr.mergeable_state === 'dirty') {
    return { eligible: false, reason: 'conflicted-or-unknown' };
  }
  if (!SHA.test(mainSha) || compare?.behind_by !== 0) {
    return { eligible: false, reason: 'stale-current-main' };
  }
  if (!SHA.test(pr.head?.sha ?? '')) {
    return { eligible: false, reason: 'invalid-head' };
  }
  if (containsOpenPrHead === true) {
    return { eligible: false, reason: 'stacked-open-head' };
  }
  const holds = labelsOf(pr).filter(label => HOLD_LABELS.has(label));
  if (holds.length > 0)
    return { eligible: false, reason: `held:${holds.join(',')}` };
  const since = ownerlessSince(pr, timeline);
  const sinceMs = Date.parse(String(since ?? ''));
  if (!Number.isFinite(sinceMs) || now - sinceMs < minimumOwnerlessMs) {
    return { eligible: false, reason: 'ownerless-under-threshold' };
  }
  const scope = classifyRecoveryFiles(files, patch, { patchComplete });
  if (!scope.eligible) return scope;
  if (checksPassing !== true) {
    return {
      eligible: false,
      lanes: scope.lanes,
      reason: 'focused-checks-not-green',
    };
  }
  return {
    eligible: true,
    reason: scope.reason,
    lanes: scope.lanes,
    ownerlessSince: new Date(sinceMs).toISOString(),
  };
}

const QUEUED_STATES = new Set([
  'AWAITING_CHECKS',
  'LOCKED',
  'MERGEABLE',
  'QUEUED',
]);

export function validateRecoveryMergeProof(proof, expectedHead) {
  if (!SHA.test(expectedHead) || proof?.headRefOid !== expectedHead) {
    return { proven: false, outcome: 'requested-unproven' };
  }
  if (
    proof.state === 'MERGED' &&
    typeof proof.mergedAt === 'string' &&
    SHA.test(proof?.mergeCommit?.oid ?? '')
  ) {
    return { proven: true, outcome: 'merged' };
  }
  const entry = proof?.mergeQueueEntry;
  if (
    proof?.isInMergeQueue === true &&
    typeof entry?.id === 'string' &&
    entry.id.length > 0 &&
    Number.isInteger(entry.position) &&
    entry.position > 0 &&
    QUEUED_STATES.has(entry.state)
  ) {
    return { proven: true, outcome: 'queued' };
  }
  return { proven: false, outcome: 'requested-unproven' };
}

export function renderRecoveryReceipt(receipt) {
  const normalized = withEvidenceSha256({
    schema: RECOVERY_RECEIPT_SCHEMA,
    pr: receipt.pr,
    head: receipt.head,
    main: receipt.main,
    ownerlessSince: receipt.ownerlessSince,
    lanes: [...receipt.lanes].sort(),
    action: receipt.action,
    outcome: receipt.outcome,
    mergeQueueState: receipt.mergeQueueState ?? null,
    mergeQueuePosition: receipt.mergeQueuePosition ?? null,
    mergeQueueEntryId: receipt.mergeQueueEntryId ?? null,
    observedAt: receipt.observedAt,
  });
  return `${RECOVERY_RECEIPT_MARKER}\n## Ownerless Recovery Receipt\n\n\`\`\`json\n${JSON.stringify(normalized, null, 2)}\n\`\`\`\n\nExact-head GitHub recovery action. This receipt is merge proof only when \`outcome\` is \`queued\` or \`merged\`.`;
}
