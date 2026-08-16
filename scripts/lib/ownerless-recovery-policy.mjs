import { createHash } from 'node:crypto';

export const RECOVERY_RECEIPT_SCHEMA = 'jovie-ownerless-recovery/v1';
export const RECOVERY_RECEIPT_MARKER =
  '<!-- bot-comment:ownerless-recovery -->';

const HOLD_LABELS = new Set([
  'blocked',
  'gated',
  'hold',
  'needs-conflict-resolution',
  'needs-human',
  'risk:high',
]);

const MATERIAL_RISK_PATH =
  /(^|\/)(auth|billing|stripe|security|secrets?|credentials?|migrations?|drizzle)(\/|$)|^apps\/web\/app\/api\/|^apps\/web\/lib\/env|^\.github\/workflows\/production-|^scripts\/security\//i;

const FOCUSED_PATHS = Object.freeze([
  {
    lane: 'ci',
    pattern:
      /^\.github\/(?:actions|scripts|workflows)\/.*(?:ci|test|lint|runner|merge|queue|agent|delivery|canary|workflow|fork|pr-|auto-ready|nightly)/i,
  },
  {
    lane: 'ci',
    pattern:
      /^scripts\/(?:lib\/)?(?:.*(?:ci|test|lint|runner|merge|queue|agent|delivery|canary|workflow|devex|worktree).*)\.(?:mjs|js|ts|py|sh)$/i,
  },
  {
    lane: 'delivery-control',
    pattern:
      /^scripts\/backlog-orchestrator\/(?:delivery-state-machine|admission-disposition)\.mjs$/,
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
    lane: 'devex',
    pattern: /^\.github\/actions\/setup-node-pnpm\//,
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

export function hasCompletePatch(file) {
  if (typeof file?.patch !== 'string') return false;
  const changedLines = file.patch
    .split('\n')
    .filter(line => /^[+-](?![+-]{2})/.test(line)).length;
  return changedLines === file.changes;
}

function labelsOf(pr) {
  return (pr?.labels ?? []).map(label =>
    typeof label === 'string' ? label : label?.name
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
    .join('\n');
  if (MATERIAL_RISK_CHANGE.test(changedLines)) {
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
