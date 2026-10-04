/**
 * Receipt-gated Linear validation lifecycle (JOV-7694, JOV-7300).
 *
 * Merge is not Done. A merged issue moves Merging → Validating once a
 * verified production generation contains the merge, and Validating → Done
 * only when every required receipt in its manifest passes for that
 * generation. A required failure routes to Rework. Unknown evidence is never
 * a pass. Everything here is pure: the merge sync script resolves GitHub,
 * production, and Linear facts and passes them in, so replayed or
 * out-of-order events converge on the same decision.
 */

import { createHash } from 'node:crypto';

export const VALIDATION_MANIFEST_SCHEMA = 'jovie.validation-manifest/v1';
export const VALIDATION_RECEIPT_SCHEMA = 'jovie.validation-receipt/v1';
export const LIFECYCLE_STATES = Object.freeze({
  merging: 'Merging',
  validating: 'Validating',
  rework: 'Rework',
  done: 'Done',
});

/**
 * Kinds the evaluator computes from GitHub, production, and the JOV-7201
 * closure contract. A comment receipt can never claim them.
 */
export const COMPUTED_RECEIPT_KINDS = Object.freeze([
  'deployment',
  'escaped-defect-dual-closure',
]);
/**
 * Kinds an owner records with a receipt comment. For UI changes (JOV-7759)
 * machines review correctness and the founder reviews taste:
 * `screen-audit` is the JOV-7713 screen-audit ledger showing every changed
 * screen green on the exact production build; `founder-taste` is the
 * founder's decision on that build, recorded from the Ovie taste card
 * (JOV-7739), and a rejection carries a note.
 */
export const RECORDED_RECEIPT_KINDS = Object.freeze([
  'outcome',
  'human-certification',
  'screen-audit',
  'founder-taste',
]);
/** Matrix judgments that owe the founder; every other judgment owes machines. */
const TASTE_JUDGMENTS = new Set(['taste', 'mixed']);
const MAX_NOTE_LENGTH = 2000;

const RECEIPT_MARKER = /<!--\s*validation-receipt:v1\s*\n?([\s\S]*?)\n?\s*-->/g;
const STATUS_MARKER = /<!--\s*validation-lifecycle:v1\s+([0-9a-f]{16})\s*-->/;
const FULL_SHA = /^[0-9a-f]{40}$/i;
const IDENTIFIER_RE = /^JOV-\d+$/i;
const RUNTIME_LABELS = new Set([
  'incident',
  'monitor',
  'golden-path',
  'ci-nightly',
]);
const RUNTIME_FINGERPRINT =
  /fingerprint `(?:ci:|sentry:monitor:|sentry:issue:|sentry:metric-alert:)/i;
const ACCEPTANCE_CUE = /acceptance|done means|done when|gate verifies/i;
const RUNTIME_CHECK = /golden[\s-]?path|e2e[\s-]smoke|nightly|cron monitor/i;
const UNCHECKED_BOX = /^\s*[-*] \[ \]\s+\S/m;
const COMMISSIONING_HEADING = /^#{1,6}\s.*commission/im;
const DECLARED_REQUIREMENT =
  /validation-required:\s*([a-z-]+(?:\s*,\s*[a-z-]+)*)/gi;

/**
 * Receipt kinds the issue author declared with `validation-required: outcome`
 * (or `human-certification`) anywhere in the description.
 *
 * @param {string} description
 * @returns {string[]}
 */
export function declaredRequirements(description) {
  const kinds = new Set();
  for (const match of String(description ?? '').matchAll(
    DECLARED_REQUIREMENT
  )) {
    for (const kind of match[1].split(',')) {
      const trimmed = kind.trim().toLowerCase();
      if (RECORDED_RECEIPT_KINDS.includes(trimmed)) kinds.add(trimmed);
    }
  }
  return [...kinds];
}

/**
 * Why an issue's acceptance is an outcome a merge or deploy cannot prove.
 * `parentReason` is the existing commissioning/parent hold from the merge
 * sync; the other signals mirror Summer's runtime-verification rule so both
 * writers agree on what needs runtime evidence.
 *
 * A reopen after Done is the strongest signal: someone already rejected a
 * merge-based closure for this issue, so merge and deploy cannot close it
 * again.
 *
 * @param {{
 *   readonly labels?: readonly string[],
 *   readonly description?: string,
 *   readonly reopenedAfterDone?: boolean,
 * }} issue
 * @param {string} parentReason
 * @returns {string[]}
 */
export function outcomeAcceptanceReasons(issue, parentReason = '') {
  const reasons = [];
  if (parentReason) reasons.push(parentReason);
  if (issue.reopenedAfterDone) {
    reasons.push('reopened after an earlier Done');
  }
  if (declaredRequirements(issue.description ?? '').includes('outcome')) {
    reasons.push('the issue declares validation-required: outcome');
  }
  const description = String(issue.description ?? '');
  const labels = (issue.labels ?? []).map(label => String(label).toLowerCase());
  const runtimeLabels = labels.filter(label => RUNTIME_LABELS.has(label));
  if (runtimeLabels.length > 0) {
    reasons.push(`runtime label ${runtimeLabels.join(', ')}`);
  }
  if (RUNTIME_FINGERPRINT.test(description)) {
    reasons.push('runtime signal fingerprint');
  }
  if (
    description
      .split('\n')
      .some(line => ACCEPTANCE_CUE.test(line) && RUNTIME_CHECK.test(line))
  ) {
    reasons.push('acceptance names a runtime check');
  }
  if (UNCHECKED_BOX.test(description)) {
    reasons.push('unchecked acceptance criteria');
  }
  if (COMMISSIONING_HEADING.test(description)) {
    reasons.push('commissioning proof section');
  }
  return reasons;
}

/**
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
 * @typedef {{ kind: string, reason: string }} RequiredReceipt
 * @typedef {{
 *   row: string,
 *   failureClass: string,
 *   judgment: string,
 *   targets: readonly string[],
 * }} UiEvidence
 * @typedef {{
 *   schema: string,
 *   issue: string,
 *   bindingSha: string,
 *   bindingPull: string,
 *   mergedPulls: string[],
 *   riskLevel: string,
 *   required: RequiredReceipt[],
 *   uiEvidence?: UiEvidence[],
 * }} ValidationManifest
 */

/**
 * The newest merge binds the evidence. Main is linear, so the newest merge
 * contains every earlier one, and an older event replayed later selects the
 * same binding.
 *
 * @param {readonly MergedPull[]} pulls
 * @returns {MergedPull | null}
 */
export function selectBindingPull(pulls) {
  const merged = pulls.filter(
    pull =>
      FULL_SHA.test(pull.mergeSha) && !Number.isNaN(Date.parse(pull.mergedAt))
  );
  if (merged.length === 0) return null;
  return [...merged].sort(
    (left, right) =>
      Date.parse(right.mergedAt) - Date.parse(left.mergedAt) ||
      right.number - left.number
  )[0];
}

/**
 * Derive the bounded required-evidence manifest from the merged change, the
 * JOV-5937 risk receipt, and the issue's own acceptance. Optional evidence
 * (dogfood, chaos, fleet) never enters `required`, so it cannot hold Done.
 *
 * @param {{
 *   readonly issue: {
 *     readonly identifier: string,
 *     readonly labels?: readonly string[],
 *     readonly description?: string,
 *     readonly reopenedAfterDone?: boolean,
 *   },
 *   readonly mergedPulls: readonly MergedPull[],
 *   readonly risk: RiskSummary | null,
 *   readonly parentReason?: string,
 *   readonly escapedDefect?: boolean,
 *   readonly uiEvidence?: readonly UiEvidence[] | null,
 * }} input
 * @returns {ValidationManifest | null}
 */
export function deriveValidationManifest(input) {
  const binding = selectBindingPull(input.mergedPulls);
  if (!binding) return null;
  /** @type {RequiredReceipt[]} */
  const required = [
    {
      kind: 'deployment',
      reason: 'a verified production generation contains the merge',
    },
  ];
  if (input.escapedDefect) {
    required.push({
      kind: 'escaped-defect-dual-closure',
      reason:
        'escaped defect: product repair and detector repair proven on a verified production generation (JOV-7201)',
    });
  }
  const outcome = outcomeAcceptanceReasons(input.issue, input.parentReason);
  if (outcome.length > 0) {
    required.push({ kind: 'outcome', reason: outcome.join('; ') });
  }
  const riskLevel = input.risk?.riskLevel ?? 'unknown';
  if (!input.risk) {
    required.push({
      kind: 'human-certification',
      reason: 'risk classification unavailable; unknown risk is not low risk',
    });
  } else if (input.risk.blocksUnattendedAutoMerge) {
    required.push({
      kind: 'human-certification',
      reason: `risk receipt blocks unattended release (${input.risk.matchedRules.join(', ') || riskLevel})`,
    });
  } else if (
    declaredRequirements(input.issue.description ?? '').includes(
      'human-certification'
    )
  ) {
    required.push({
      kind: 'human-certification',
      reason: 'the issue declares validation-required: human-certification',
    });
  }
  // JOV-7713 names the UI rows a change invalidates, each with a judgment.
  // Deterministic rows owe machine evidence, taste rows owe the founder, and
  // mixed rows owe both, so ordinary UI work never waits on Tim. `null` means
  // the merged files or the matrix could not be read: unknown machine
  // evidence, never "no UI".
  const uiEvidence = input.uiEvidence === undefined ? [] : input.uiEvidence;
  /** @param {(judgment: string) => boolean} owes */
  const owing = owes =>
    (uiEvidence ?? []).filter(entry => owes(String(entry.judgment)));
  /** @param {readonly UiEvidence[]} rows */
  const describe = rows =>
    `${rows.map(entry => `${entry.row} ${entry.failureClass}`).join(', ')} on ${[...new Set(rows.flatMap(entry => entry.targets))].join(', ')}`;
  const machine = owing(judgment => judgment !== 'taste');
  const taste = owing(judgment => TASTE_JUDGMENTS.has(judgment));
  if (uiEvidence === null) {
    required.push({
      kind: 'screen-audit',
      reason:
        'UI evidence is unknown (merged files or the assurance matrix were unreadable); the screen-audit ledger must show the exact build green',
    });
  } else if (machine.length > 0) {
    required.push({
      kind: 'screen-audit',
      reason: `UI change invalidates ${describe(machine)}; the screen-audit ledger (JOV-7713) must show every changed screen green on the exact production build`,
    });
  }
  if (taste.length > 0) {
    required.push({
      kind: 'founder-taste',
      reason: `UI change invalidates ${describe(taste)}; the founder accepts the exact production build (Ovie taste card, JOV-7739)`,
    });
  }
  if (
    !required.some(entry => entry.kind === 'founder-taste') &&
    declaredRequirements(input.issue.description ?? '').includes(
      'founder-taste'
    )
  ) {
    required.push({
      kind: 'founder-taste',
      reason: 'the issue declares validation-required: founder-taste',
    });
  }
  return {
    schema: VALIDATION_MANIFEST_SCHEMA,
    issue: input.issue.identifier.toUpperCase(),
    bindingSha: binding.mergeSha.toLowerCase(),
    bindingPull: binding.url,
    mergedPulls: [...input.mergedPulls]
      .sort((left, right) => left.number - right.number)
      .map(pull => pull.url),
    riskLevel,
    required,
    ...(uiEvidence && uiEvidence.length > 0
      ? {
          uiEvidence: uiEvidence.map(entry => ({
            row: entry.row,
            failureClass: entry.failureClass,
            judgment: entry.judgment,
            targets: [...entry.targets],
          })),
        }
      : {}),
  };
}

/**
 * @typedef {{
 *   kind: string,
 *   status: 'pass' | 'fail',
 *   sha: string,
 *   evidence: string,
 *   note?: string,
 *   recordedAt: string,
 * }} ValidationReceipt
 */

/**
 * Read recorded receipts from issue comments. The time is the comment's
 * server timestamp, never a value the producer wrote. Receipts for another
 * issue, computed kinds, or malformed bodies are ignored.
 *
 * @param {readonly { body?: string, createdAt?: string }[]} comments
 * @param {string} identifier
 * @returns {ValidationReceipt[]}
 */
export function parseValidationReceipts(comments, identifier) {
  const issue = String(identifier).toUpperCase();
  /** @type {ValidationReceipt[]} */
  const receipts = [];
  for (const comment of comments) {
    const recordedAt = String(comment?.createdAt ?? '');
    if (Number.isNaN(Date.parse(recordedAt))) continue;
    for (const match of String(comment?.body ?? '').matchAll(RECEIPT_MARKER)) {
      let parsed;
      try {
        parsed = JSON.parse(match[1]);
      } catch {
        continue;
      }
      if (!parsed || typeof parsed !== 'object') continue;
      const kind = String(parsed.kind ?? '');
      const status = String(parsed.status ?? '');
      const sha = String(parsed.sha ?? '').toLowerCase();
      if (
        parsed.schema !== VALIDATION_RECEIPT_SCHEMA ||
        String(parsed.issue ?? '').toUpperCase() !== issue ||
        !RECORDED_RECEIPT_KINDS.includes(kind) ||
        (status !== 'pass' && status !== 'fail') ||
        !FULL_SHA.test(sha) ||
        typeof parsed.evidence !== 'string' ||
        parsed.evidence.trim().length < 8
      ) {
        continue;
      }
      const note =
        typeof parsed.note === 'string'
          ? parsed.note.trim().slice(0, MAX_NOTE_LENGTH)
          : '';
      receipts.push({
        kind,
        status,
        sha,
        evidence: parsed.evidence.trim(),
        ...(note ? { note } : {}),
        recordedAt,
      });
    }
  }
  return receipts;
}

/**
 * Format a receipt comment for an owner to record (Summer, Ovie, a
 * certification producer, or a human through the CLI below).
 *
 * @param {{
 *   issue: string,
 *   kind: string,
 *   status: 'pass' | 'fail',
 *   sha: string,
 *   evidence: string,
 *   note?: string,
 * }} receipt
 * @returns {string}
 */
export function formatValidationReceipt(receipt) {
  if (!IDENTIFIER_RE.test(receipt.issue)) {
    throw new Error('receipt issue must be a JOV identifier');
  }
  if (!RECORDED_RECEIPT_KINDS.includes(receipt.kind)) {
    throw new Error(
      `receipt kind must be one of ${RECORDED_RECEIPT_KINDS.join(', ')}`
    );
  }
  if (receipt.status !== 'pass' && receipt.status !== 'fail') {
    throw new Error('receipt status must be pass or fail');
  }
  if (!FULL_SHA.test(receipt.sha)) {
    throw new Error('receipt sha must be a full commit SHA');
  }
  if (String(receipt.evidence ?? '').trim().length < 8) {
    throw new Error('receipt evidence must reference the proof');
  }
  const note = String(receipt.note ?? '').trim();
  if (note.length > MAX_NOTE_LENGTH) {
    throw new Error(
      `receipt note must be at most ${MAX_NOTE_LENGTH} characters`
    );
  }
  const payload = {
    schema: VALIDATION_RECEIPT_SCHEMA,
    issue: receipt.issue.toUpperCase(),
    kind: receipt.kind,
    status: receipt.status,
    sha: receipt.sha.toLowerCase(),
    evidence: receipt.evidence.trim(),
    ...(note ? { note } : {}),
  };
  return [
    `Validation receipt: ${payload.kind} ${payload.status} for ${payload.sha.slice(0, 12)}. Evidence: ${payload.evidence}`,
    ...(note ? [`Note: ${note}`] : []),
    '',
    `<!-- validation-receipt:v1\n${JSON.stringify(payload)}\n-->`,
  ].join('\n');
}

/**
 * @typedef {{
 *   status: 'verified' | 'pending' | 'unknown',
 *   sha?: string,
 *   detail?: string,
 * }} DeploymentFact
 * @typedef {ValidationReceipt & {
 *   containsBinding: boolean,
 *   verifiedArtifact: boolean,
 * }} ResolvedReceipt
 */

/**
 * Latest receipt per kind that is bound to the current generation. A receipt
 * for a commit that does not contain the binding merge is stale: a fix merge
 * makes the earlier failure (and pass) irrelevant, so the original evidence
 * must run again on the new generation.
 *
 * @param {readonly ResolvedReceipt[]} receipts
 * @returns {Map<string, ResolvedReceipt>}
 */
export function currentReceiptsByKind(receipts) {
  /** @type {Map<string, ResolvedReceipt>} */
  const latest = new Map();
  for (const receipt of receipts) {
    if (!receipt.containsBinding) continue;
    const previous = latest.get(receipt.kind);
    if (
      !previous ||
      Date.parse(receipt.recordedAt) >= Date.parse(previous.recordedAt)
    ) {
      latest.set(receipt.kind, receipt);
    }
  }
  return latest;
}

/**
 * The transition table. Pure and idempotent: the same facts always produce
 * the same target, and a target equal to the current state is no move.
 *
 * @param {{
 *   readonly state: { name: string, type: string },
 *   readonly manifest: ValidationManifest,
 *   readonly holds: readonly string[],
 *   readonly deployment: DeploymentFact,
 *   readonly receipts: readonly ResolvedReceipt[],
 *   readonly escapedDefect?: { ok: boolean, errors: readonly string[] },
 * }} input
 * @returns {{
 *   target: string | null,
 *   missing: string[],
 *   failing: ResolvedReceipt[],
 *   explanation: string[],
 * }}
 */
export function decideValidationTransition(input) {
  const stateType = String(input.state.type ?? '');
  if (stateType === 'completed' || stateType === 'canceled') {
    // Done is historical acceptance. A later regression is a new incident,
    // not a silent reopen of accepted work.
    return { target: null, missing: [], failing: [], explanation: [] };
  }
  if (input.holds.length > 0) {
    return {
      target: null,
      missing: [],
      failing: [],
      explanation: [...input.holds],
    };
  }
  const current = currentReceiptsByKind(input.receipts);
  const requiredKinds = input.manifest.required.map(entry => entry.kind);
  const failing = requiredKinds
    .map(kind => current.get(kind))
    .filter(
      /** @returns {receipt is ResolvedReceipt} */
      receipt => receipt?.status === 'fail'
    );
  if (failing.length > 0) {
    return {
      target: LIFECYCLE_STATES.rework,
      missing: [],
      failing,
      explanation: failing.map(
        receipt =>
          `Required ${receipt.kind} failed at ${receipt.sha.slice(0, 12)}: ${receipt.evidence}${receipt.note ? `. Note: ${receipt.note}` : ''}`
      ),
    };
  }
  if (input.deployment.status === 'unknown') {
    return {
      target: null,
      missing: ['deployment'],
      failing: [],
      explanation: [
        `Deployment identity is unknown (${input.deployment.detail ?? 'no detail'}); the state is unchanged until it resolves.`,
      ],
    };
  }
  if (input.deployment.status !== 'verified') {
    return {
      target: LIFECYCLE_STATES.merging,
      missing: ['deployment'],
      failing: [],
      explanation: [
        `No verified production generation contains ${input.manifest.bindingSha.slice(0, 12)} yet${input.deployment.detail ? ` (${input.deployment.detail})` : ''}.`,
      ],
    };
  }
  const missing = [];
  const explanation = [];
  for (const entry of input.manifest.required) {
    if (entry.kind === 'deployment') continue;
    if (entry.kind === 'escaped-defect-dual-closure') {
      if (input.escapedDefect?.ok === true) continue;
      missing.push(entry.kind);
      const errors = input.escapedDefect?.errors ?? [
        'closure evidence unavailable',
      ];
      explanation.push(`${entry.kind}: ${errors.join('; ')}`);
      continue;
    }
    const receipt = current.get(entry.kind);
    if (receipt?.status === 'pass' && receipt.verifiedArtifact) continue;
    missing.push(entry.kind);
    explanation.push(
      receipt?.status === 'pass'
        ? `${entry.kind}: the passing receipt names ${receipt.sha.slice(0, 12)}, which is not a verified production generation`
        : `${entry.kind}: no current receipt (${entry.reason})`
    );
  }
  if (missing.length > 0) {
    return {
      target: LIFECYCLE_STATES.validating,
      missing,
      failing: [],
      explanation,
    };
  }
  return {
    target: LIFECYCLE_STATES.done,
    missing: [],
    failing: [],
    explanation: [
      `Every required receipt passed on verified production generation ${String(input.deployment.sha ?? '').slice(0, 12)}.`,
    ],
  };
}

/**
 * Stable key for the status comment, so a replayed event or an unchanged
 * sweep never posts the same explanation twice.
 *
 * @param {{
 *   target: string | null,
 *   manifest: ValidationManifest,
 *   missing: readonly string[],
 *   failing: readonly ResolvedReceipt[],
 *   deploymentSha?: string,
 * }} input
 * @returns {string}
 */
export function lifecycleStatusKey(input) {
  return createHash('sha256')
    .update(
      JSON.stringify({
        target: input.target,
        binding: input.manifest.bindingSha,
        required: input.manifest.required.map(entry => entry.kind),
        missing: [...input.missing].sort(),
        failing: input.failing
          .map(receipt => `${receipt.kind}:${receipt.sha}`)
          .sort(),
        deployment:
          input.target === LIFECYCLE_STATES.done
            ? (input.deploymentSha ?? '')
            : '',
      })
    )
    .digest('hex')
    .slice(0, 16);
}

/**
 * @param {readonly { body?: string }[]} comments
 * @returns {string}
 */
export function latestLifecycleStatusKey(comments) {
  let key = '';
  for (const comment of comments) {
    const match = STATUS_MARKER.exec(String(comment?.body ?? ''));
    if (match) key = match[1];
  }
  return key;
}

/**
 * Human- and Summer-readable explanation with the machine-readable manifest.
 *
 * @param {{
 *   identifier: string,
 *   from: string,
 *   target: string | null,
 *   manifest: ValidationManifest,
 *   missing: readonly string[],
 *   explanation: readonly string[],
 *   statusKey: string,
 *   deploymentSha?: string,
 * }} input
 * @returns {string}
 */
export function formatLifecycleComment(input) {
  const moved =
    input.target && input.target !== input.from
      ? `Validation lifecycle moved ${input.identifier} from ${input.from} to ${input.target}.`
      : `Validation lifecycle kept ${input.identifier} in ${input.from}.`;
  const lines = [
    moved,
    `Binding merge: ${input.manifest.bindingPull} (${input.manifest.bindingSha}).`,
  ];
  if (input.deploymentSha) {
    lines.push(`Verified production generation: ${input.deploymentSha}.`);
  }
  if (input.missing.length > 0) {
    lines.push(`Next missing receipt: ${input.missing[0]}.`);
  }
  for (const line of input.explanation) lines.push(`- ${line}`);
  lines.push(
    '',
    `<!-- validation-manifest:v1\n${JSON.stringify(input.manifest)}\n-->`,
    `<!-- validation-lifecycle:v1 ${input.statusKey} -->`
  );
  return lines.join('\n');
}
