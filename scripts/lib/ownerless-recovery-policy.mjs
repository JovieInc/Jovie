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
const SUPERSESSION_RE = /<!--\s*jovie-supersession:v1(?:\s+([^>]*?))?\s*-->/g;
const SUPERSESSION_ATTR_RE =
  /([A-Za-z][A-Za-z0-9_-]*)=("[^"]*"|'[^']*'|[^\s>]+)/g;
const TERMINAL_STATES = new Set(
  'done|completed|canceled|cancelled|closed|duplicate'.split('|')
);
const IN_PROGRESS_STATES = new Set(['in progress', 'rework']);
const REMEDIATING_STATES = new Set(['todo', ...IN_PROGRESS_STATES]);

function evidenceSha256(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function withEvidenceSha256(value) {
  return { ...value, evidenceSha256: evidenceSha256(value) };
}

const fleet = {
  issueId(issue) {
    return String(issue?.identifier || issue?.key || '')
      .trim()
      .toUpperCase();
  },
  issueState(issue) {
    return String(issue?.state?.name || issue?.state || '')
      .trim()
      .toLowerCase();
  },
  prNumber(pr) {
    const value = Number(pr?.number);
    return Number.isInteger(value) && value > 0 ? value : null;
  },
  prHead(pr) {
    return String(pr?.head?.sha || pr?.headRefOid || pr?.headSha || '').trim();
  },
  labels(pr) {
    return (pr?.labels ?? [])
      .map(label => (typeof label === 'string' ? label : label?.name))
      .filter(Boolean)
      .map(label => String(label).toLowerCase());
  },
  unique(values) {
    return [...new Set(values.filter(Boolean).map(String))].sort();
  },
  text(value, depth = 0) {
    if (depth > 3 || value == null) return [];
    if (['string', 'number'].includes(typeof value)) return [String(value)];
    if (Array.isArray(value))
      return value.flatMap(item => fleet.text(item, depth + 1));
    return typeof value === 'object'
      ? Object.values(value).flatMap(item => fleet.text(item, depth + 1))
      : [];
  },
  ids(...values) {
    return fleet.unique(
      fleet
        .text(values)
        .flatMap(value => value.match(LINEAR_IDENTIFIER) ?? [])
        .map(value => value.toUpperCase())
    );
  },
  comments(owner) {
    return (owner?.comments?.nodes ?? owner?.comments ?? []).map(
      comment => comment?.body ?? comment
    );
  },
  supersessionAttrs(raw) {
    return Object.fromEntries(
      [...String(raw || '').matchAll(SUPERSESSION_ATTR_RE)].map(match => [
        match[1],
        match[2].replace(/^['"]|['"]$/g, ''),
      ])
    );
  },
  parseSupersessions(pr) {
    return [pr?.body, ...fleet.comments(pr)]
      .flatMap(value => [...String(value || '').matchAll(SUPERSESSION_RE)])
      .map(match => {
        const attrs = fleet.supersessionAttrs(match[1]);
        const owner = String(attrs.owner || '').toUpperCase();
        const replacementValues = String(attrs.replacements || '')
          .split(',')
          .filter(Boolean);
        const replacements = replacementValues.map(Number);
        const violations = [];
        if (attrs.status !== 'superseded')
          violations.push('supersession-status-invalid');
        if (!/^[A-Z][A-Z0-9]+-\d+$/.test(owner))
          violations.push('supersession-owner-invalid');
        if (
          !replacementValues.length ||
          !replacements.every(value => Number.isInteger(value) && value > 0)
        )
          violations.push('supersession-replacements-invalid');
        return {
          status: attrs.status || null,
          owner,
          replacements,
          violations,
        };
      });
  },
  supersessionIndex(pullRequests, linearIssues) {
    const openPrs = new Set(pullRequests.map(fleet.prNumber).filter(Boolean));
    const knownIssues = new Set(
      linearIssues.map(fleet.issueId).filter(Boolean)
    );
    const byPr = new Map();
    for (const pr of pullRequests) {
      const number = fleet.prNumber(pr);
      const markers = fleet.parseSupersessions(pr);
      if (!number || !markers.length) continue;
      const first = markers[0];
      const record = {
        ...first,
        statusValue: first.status,
        status: 'invalid',
        violations: [...first.violations],
      };
      if (markers.length !== 1)
        record.violations.push('supersession-ambiguous');
      if (first.owner && !knownIssues.has(first.owner))
        record.violations.push('supersession-owner-unresolved');
      for (const replacement of first.replacements)
        if (!openPrs.has(replacement))
          record.violations.push('supersession-replacement-missing-open-pr');
      byPr.set(number, record);
    }
    const graph = new Map(
      [...byPr].map(([number, record]) => [number, record.replacements])
    );
    const reaches = (start, target, seen = new Set()) =>
      start === target ||
      (!seen.has(start) &&
        (seen.add(start),
        (graph.get(start) ?? []).some(next => reaches(next, target, seen))));
    for (const [number, record] of byPr) {
      if (record.replacements.some(replacement => reaches(replacement, number)))
        record.violations.push('supersession-cycle');
      record.violations = fleet.unique(record.violations);
      record.status = record.violations.length === 0 ? 'valid' : 'invalid';
    }
    return byPr;
  },
  attachedPrs(issue) {
    return fleet
      .unique(
        fleet
          .text([
            issue?.attachments?.nodes ?? issue?.attachments,
            issue?.relations?.nodes ?? issue?.relations,
          ])
          .flatMap(value =>
            [
              ...value.matchAll(
                /(?:github\.com\/JovieInc\/Jovie\/pull\/|\bJovieInc\/Jovie#)(\d+)/gi
              ),
            ].map(match => match[1])
          )
      )
      .map(Number);
  },
  packetIds(packetMap, number) {
    if (!packetMap || number == null) return [];
    if (Array.isArray(packetMap))
      return fleet.ids(
        packetMap
          .filter(entry => Number(entry?.pr ?? entry?.number) === number)
          .flatMap(entry => [entry.issue, entry.identifier, entry.linearIssue])
      );
    return fleet.ids(
      packetMap[number] ??
        packetMap[String(number)] ??
        packetMap.prs?.[number] ??
        packetMap.prs?.[String(number)]
    );
  },
  provenance(pr, { linearIssues = [], prPacketMap = {} } = {}) {
    const number = fleet.prNumber(pr);
    const issues = new Map();
    const sources = new Map();
    const add = (identifier, source) => {
      const id = String(identifier || '').toUpperCase();
      if (!id) return;
      const set = sources.get(id) ?? new Set();
      set.add(source);
      sources.set(id, set);
    };
    for (const issue of linearIssues) {
      const id = fleet.issueId(issue);
      if (id) issues.set(id, issue);
      if (fleet.attachedPrs(issue).includes(number))
        add(id, 'exact-pr-attachment');
    }
    for (const id of fleet.ids(
      pr?.title,
      pr?.body,
      pr?.headRefName,
      pr?.head?.ref,
      pr?.branch,
      pr?.comments
    ))
      add(id, 'explicit-linear-id');
    for (const marker of fleet.parseSupersessions(pr))
      add(marker.owner, 'supersession-marker-owner');
    for (const id of fleet.packetIds(prPacketMap, number))
      add(id, 'jov-5610-pr-packet');
    const identifiers = fleet.unique([...sources.keys()]);
    const known = identifiers.filter(id => issues.has(id));
    const sourceMap = list =>
      Object.fromEntries(list.map(id => [id, [...sources.get(id)].sort()]));
    if (!known.length)
      return {
        status: 'missing',
        reason: identifiers.length
          ? 'linear-provenance-unresolved'
          : 'missing-linear-provenance',
        identifiers,
        sources: sourceMap(identifiers),
      };
    if (known.length > 1)
      return {
        status: 'ambiguous',
        reason: 'ambiguous-linear-provenance',
        identifiers: known,
        sources: sourceMap(known),
      };
    return {
      status: 'owned',
      reason: 'canonical-linear-provenance',
      identifier: known[0],
      issue: issues.get(known[0]),
      sources: [...sources.get(known[0])].sort(),
    };
  },
  leaseId(value) {
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
  },
  symphony(state, now, staleAfterMs) {
    const raw = state ?? {
      observedAt: now.toISOString(),
      running: [],
      retrying: [],
      blocked: [],
      source: 'unsupplied-symphony-state',
    };
    if (!raw || typeof raw !== 'object')
      return { healthy: false, reason: 'symphony-state-malformed' };
    const observedAt = String(raw.observedAt || '');
    const observedMs = Date.parse(observedAt);
    if (!Number.isFinite(observedMs))
      return { healthy: false, reason: 'symphony-state-malformed' };
    const ageMs = now.getTime() - observedMs;
    if (ageMs < -30_000 || ageMs >= staleAfterMs)
      return { healthy: false, reason: 'symphony-state-stale' };
    const entries = key =>
      new Set(
        fleet.unique(
          (Array.isArray(raw[key]) ? raw[key] : [])
            .map(fleet.leaseId)
            .filter(Boolean)
        )
      );
    return {
      healthy: true,
      reason: null,
      observedAt,
      source: raw.source || 'official-symphony-state',
      running: entries('running'),
      retrying: entries('retrying'),
      blocked: entries('blocked'),
    };
  },
  ownership(provenance, symphony) {
    const issue = provenance.status === 'owned' ? provenance.identifier : null;
    if (!issue)
      return { status: 'ownerless/stalled', reason: provenance.reason, issue };
    const state = fleet.issueState(provenance.issue);
    if (TERMINAL_STATES.has(state))
      return {
        status: 'ownerless/stalled',
        reason: 'terminal-linear-issue-open-pr',
        issue,
      };
    if (
      IN_PROGRESS_STATES.has(state) &&
      !(symphony.running?.has(issue) || symphony.retrying?.has(issue))
    )
      return {
        status: 'ownerless/stalled',
        reason: 'in-progress-without-live-symphony-lease',
        issue,
      };
    return { status: 'accountable', reason: provenance.reason, issue };
  },
  display(pr, labels, hardStops, supersession) {
    if (
      supersession?.status === 'valid' ||
      supersession?.statusValue === 'superseded'
    )
      return {
        category: 'superseded',
        reason: `supersession-marker${supersession.status === 'valid' ? '' : '-invalid'}`,
      };
    if (labels.includes('superseded'))
      return { category: 'superseded', reason: 'legacy-superseded-label' };
    if (pr?.draft === true || pr?.isDraft === true)
      return { category: 'draft', reason: 'draft' };
    if (hardStops.length)
      return {
        category: 'blocked',
        reason: `held:${hardStops.sort().join(',')}`,
      };
    if (
      pr?.isInMergeQueue === true ||
      pr?.mergeQueueEntry ||
      pr?.queueState?.queued
    )
      return { category: 'native queue', reason: 'native-queue-owned' };
    if (
      pr?.mergeable === false ||
      pr?.mergeable_state === 'dirty' ||
      pr?.mergeStateStatus === 'DIRTY' ||
      pr?.checksPassing === false
    )
      return {
        category: 'conflict/unstable',
        reason: 'conflict-or-checks-not-green',
      };
    return null;
  },
  classify(pr, options = {}) {
    const {
      linearIssues = [],
      prPacketMap = {},
      symphonyState = null,
      supersession = null,
      now = new Date(),
      staleAfterMs = FLEET_CLOSURE_LEASE_STALE_MS,
    } = options;
    const labels = fleet.labels(pr);
    const provenance = fleet.provenance(pr, { linearIssues, prPacketMap });
    const item = {
      pr: fleet.prNumber(pr),
      head: fleet.prHead(pr),
      issue: provenance.status === 'owned' ? provenance.identifier : null,
      ...fleet.display(
        pr,
        labels,
        labels.filter(label => HOLD_LABELS.has(label)),
        supersession
      ),
      supersession: supersession && {
        status: supersession.status,
        owner: supersession.owner,
        replacements: supersession.replacements,
        violations: supersession.violations,
      },
      provenance,
      ownership: fleet.ownership(
        provenance,
        fleet.symphony(symphonyState, now, staleAfterMs)
      ),
    };
    if (!item.category)
      Object.assign(
        item,
        item.ownership.status === 'accountable' &&
          REMEDIATING_STATES.has(fleet.issueState(provenance.issue))
          ? { category: 'remediating', reason: 'linear-active-remediation' }
          : item.ownership.status === 'accountable'
            ? { category: 'ready/green', reason: 'accountable-green-pr' }
            : { category: item.ownership.status, reason: item.ownership.reason }
      );
    return item;
  },
  remediationAction(item) {
    if (item.category === 'native queue') return 'preserve-native-queue-owner';
    if (item.category === 'blocked') return 'preserve-hard-stop-owner';
    return item.ownership?.issue
      ? 'emit-linear-remediation-intent'
      : 'operator-owned-exception';
  },
  violation(item, reason, action, issue = item.ownership?.issue) {
    return {
      scope: 'pull-request',
      pr: item.pr,
      head: item.head,
      issue,
      displayCategory: item.category,
      reason,
      action,
    };
  },
  snapshotViolations(pullRequests, snapshot, now) {
    const violations = [];
    const add = (reason, extra = {}) =>
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
    if (complete !== true) add('github-pagination-truncated');
    const seen = new Set();
    for (const pr of pullRequests) {
      const number = fleet.prNumber(pr);
      if (seen.has(number))
        add('github-pagination-duplicate-pr', { pr: number });
      seen.add(number);
    }
    const startedAt = Date.parse(snapshot?.startedAt ?? now.toISOString());
    const completedAt = Date.parse(snapshot?.completedAt ?? now.toISOString());
    if (Number.isFinite(startedAt) && Number.isFinite(completedAt))
      for (const pr of pullRequests) {
        const createdAt = Date.parse(pr?.created_at ?? pr?.createdAt ?? '');
        if (
          Number.isFinite(createdAt) &&
          createdAt >= startedAt &&
          createdAt <= completedAt
        )
          add('github-pr-created-during-pagination', {
            pr: fleet.prNumber(pr),
          });
      }
    return violations;
  },
  audit({
    repository = 'JovieInc/Jovie',
    pullRequests = [],
    linearIssues = [],
    prPacketMap = {},
    symphonyState = null,
    snapshot = {},
    now = new Date(),
    staleAfterMs = FLEET_CLOSURE_LEASE_STALE_MS,
  } = {}) {
    const snapshotRecord = /** @type {Record<string, any>} */ (snapshot);
    const symphony = fleet.symphony(symphonyState, now, staleAfterMs);
    const counts = Object.fromEntries(
      FLEET_CLOSURE_COUNT_KEYS.map(key => [key, 0])
    );
    const ownershipCounts = { accountable: 0, 'ownerless/stalled': 0 };
    const violations = fleet.snapshotViolations(
      pullRequests,
      snapshotRecord,
      now
    );
    const remediationIntents = [];
    const supersessions = fleet.supersessionIndex(pullRequests, linearIssues);
    if (!symphony.healthy)
      violations.push({
        scope: 'symphony',
        reason: symphony.reason,
        action: 'reattach-remediation-lane',
      });
    const items = pullRequests.map(pr => {
      const item = fleet.classify(pr, {
        linearIssues,
        prPacketMap,
        symphonyState,
        supersession: supersessions.get(fleet.prNumber(pr)) ?? null,
        now,
        staleAfterMs,
      });
      counts[item.category] += 1;
      ownershipCounts[item.ownership.status] += 1;
      if (item.ownership.status === 'ownerless/stalled') {
        const action = fleet.remediationAction(item);
        violations.push(fleet.violation(item, item.ownership.reason, action));
        if (action === 'emit-linear-remediation-intent')
          remediationIntents.push({
            schema: FLEET_REMEDIATION_LEASE_SCHEMA,
            pr: item.pr,
            head: item.head,
            issue: item.ownership.issue,
            displayCategory: item.category,
            reason: item.ownership.reason,
            action: 'reattach-remediation-lane',
            consumer: 'symphony-linear-writer',
          });
      }
      for (const reason of item.supersession?.violations ?? [])
        violations.push(
          fleet.violation(
            item,
            reason,
            'operator-owned-exception',
            item.supersession.owner || item.issue
          )
        );
      return item;
    });
    return withEvidenceSha256({
      schema: FLEET_CLOSURE_AUDIT_SCHEMA,
      repository,
      observedAt: now.toISOString(),
      status: violations.length === 0 ? 'healthy' : 'blocked',
      snapshot: {
        startedAt: snapshotRecord.startedAt ?? null,
        completedAt: snapshotRecord.completedAt ?? null,
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
    });
  },
};

export const buildPrFleetClosureAudit = options => fleet.audit(options);

export const FLEET_CLOSURE_DISPATCH_BLOCK_REASONS = Object.freeze([
  'github-pagination-truncated',
  'github-pr-created-during-pagination',
  'github-pagination-duplicate-pr',
  'symphony-state-stale',
  'symphony-state-malformed',
]);

export function shouldDispatchOwnerlessRecovery(audit) {
  if (!audit?.symphony?.healthy) return false;
  return !(audit.violations ?? []).some(violation =>
    FLEET_CLOSURE_DISPATCH_BLOCK_REASONS.includes(violation.reason)
  );
}

export function findOfficialSymphonyLease(
  state,
  identifier,
  { now = new Date(), staleAfterMs = FLEET_CLOSURE_LEASE_STALE_MS } = {}
) {
  if (!state) return { ok: false, reason: 'symphony-state-missing' };
  const symphony = fleet.symphony(state, now, staleAfterMs);
  if (!symphony.healthy) return { ok: false, reason: symphony.reason };
  const issue = String(identifier || '').toUpperCase();
  const leaseState = ['running', 'retrying'].find(key =>
    symphony[key].has(issue)
  );
  return {
    ok: Boolean(leaseState),
    state: leaseState,
    reason: leaseState ? undefined : 'symphony-lease-readback-missing',
    source: symphony.source,
    observedAt: symphony.observedAt,
  };
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
  return `${FLEET_REMEDIATION_LEASE_MARKER}\n${JSON.stringify(normalized, null, 2)}\n<!-- /jovie-pr-fleet-remediation-lease -->`;
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
  return fleet
    .comments(issue)
    .flatMap(comment => parseFleetClosureRemediationLeases(comment))
    .some(
      receipt =>
        receipt.pr === intent.pr &&
        receipt.head === intent.head &&
        receipt.issue === intent.issue &&
        receipt.reason === intent.reason
    );
}

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
  const holds = fleet.labels(pr).filter(label => HOLD_LABELS.has(label));
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
  const normalized = {
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
  };
  normalized.evidenceSha256 = createHash('sha256')
    .update(JSON.stringify(normalized))
    .digest('hex');
  return `${RECOVERY_RECEIPT_MARKER}\n## Ownerless Recovery Receipt\n\n\`\`\`json\n${JSON.stringify(normalized, null, 2)}\n\`\`\`\n\nExact-head GitHub recovery action. This receipt is merge proof only when \`outcome\` is \`queued\` or \`merged\`.`;
}
