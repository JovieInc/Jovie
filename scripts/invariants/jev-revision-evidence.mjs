/** Bounded archive validation for JOV-8414. Trusted owner projections, never approvals. */
import { createHash } from 'node:crypto';
import {
  WRITING_QUALITY_AXES,
  WRITING_QUALITY_RUBRICS,
} from '../../packages/copy/writing-quality.ts';
import { canonical } from '../lib/canonical-json.mjs';
import { readWritingSurfacesRegistry } from './writing-surfaces.mjs';
export const REVISION_REPLAY_SCHEMA = 'jovie.revision-replay/v1';
export const MAX_REVISION_EXAMPLES = 500;
export const REVISION_SCENARIOS = Object.freeze([
  'accurate-but-generic',
  'approved-voice',
  'budget-failure',
  'confident-false-claim',
  'deliberate-fragments',
  'non-English',
  'revision-drift',
  'timeout',
  'uncertainty',
]);
const text = v => typeof v === 'string' && v.trim().length > 0;
const finite = v => Number.isFinite(v) && v >= 0;
const sha = v => typeof v === 'string' && /^[a-f0-9]{64}$/u.test(v);
const strings = v => Array.isArray(v) && v.every(text);
const unique = v => new Set(v).size === v.length;
const state = v => ['accepted', 'abstain', 'fallback'].includes(v);
const normalized = v =>
  v.normalize('NFKC').replace(/\s+/gu, ' ').trim().toLowerCase();
export const revisionTextDigest = v =>
  createHash('sha256').update(v).digest('hex');
export const revisionEvidenceDigest = v => revisionTextDigest(canonical(v));
const sameSet = (a, b) =>
  strings(a) &&
  strings(b) &&
  unique(a) &&
  unique(b) &&
  canonical([...a].sort()) === canonical([...b].sort());
function validateCorpus(input, reasons) {
  const corpus = input?.corpus;
  if (
    input?.schema !== REVISION_REPLAY_SCHEMA ||
    !text(corpus?.version) ||
    !Array.isArray(corpus?.examples) ||
    !corpus.examples.length ||
    corpus.examples.length > MAX_REVISION_EXAMPLES
  ) {
    reasons.push('missing-or-unbounded-versioned-corpus');
    return null;
  }
  const examples = corpus.examples;
  if (
    examples.some(
      e =>
        !text(e?.id) ||
        !text(e.documentId) ||
        !text(e.text) ||
        e.text.length > 20_000 ||
        !sha(e.evidenceSha256) ||
        !['tuning', 'holdout'].includes(e.split) ||
        !state(e.expectedState) ||
        !strings(e.scenarios) ||
        e.scenarios.some(s => !REVISION_SCENARIOS.includes(s))
    ) ||
    !unique(examples.map(e => e.id))
  ) {
    reasons.push('invalid-or-duplicate-corpus-example');
    return null;
  }
  const tuning = examples.filter(e => e.split === 'tuning');
  const holdout = examples.filter(e => e.split === 'holdout');
  if (!tuning.length || !holdout.length)
    reasons.push('missing-tuning-or-holdout');
  const tuningDocs = new Set(tuning.map(e => e.documentId));
  const tuningTexts = new Set(tuning.map(e => normalized(e.text)));
  if (
    holdout.some(
      e => tuningDocs.has(e.documentId) || tuningTexts.has(normalized(e.text))
    )
  )
    reasons.push('tuning-holdout-contamination');
  if (!unique(holdout.map(e => normalized(e.text))))
    reasons.push('duplicate-heldout-text');
  for (const scenario of REVISION_SCENARIOS)
    if (!holdout.some(e => e.scenarios.includes(scenario)))
      reasons.push(`missing-scenario:${scenario}`);
  return { examples, tuning, holdout };
}

function validateOwners(input, corpus, reasons) {
  const {
    target,
    labels,
    calibration: cal,
    limits,
    promptContext: context,
  } = input;
  const surface = readWritingSurfacesRegistry().surfaces.find(
    s => s.id === target?.surfaceId
  );
  const rubricSha256 = revisionEvidenceDigest(WRITING_QUALITY_RUBRICS);
  if (
    !surface ||
    surface.policyVersion !== target.policyVersion ||
    !/^[a-f0-9]{40}$/u.test(target?.sourceSha) ||
    !text(target?.writerModel) ||
    !text(target?.resolvedModel) ||
    !text(target?.writerProvider) ||
    !text(target?.judgeProvider) ||
    target.corpusSha256 !== revisionEvidenceDigest(input.corpus) ||
    target.labelsSha256 !== revisionEvidenceDigest(labels ?? null) ||
    target.rubricSha256 !== rubricSha256
  )
    reasons.push('target-or-corpus-label-model-rubric-binding-invalid');
  const targetDigest = revisionEvidenceDigest(target ?? null);
  if (
    labels?.issue !== 'JOV-6476' ||
    labels?.labelProvenance !== 'human-adjudicated' ||
    !text(labels?.sourceOwnerApprovalRef) ||
    !text(labels?.ownerRef) ||
    !Number.isFinite(labels?.approvedAt) ||
    labels?.corpusSha256 !== target?.corpusSha256 ||
    labels?.rubricSha256 !== rubricSha256 ||
    !Array.isArray(labels?.rows) ||
    labels.rows.length > MAX_REVISION_EXAMPLES ||
    !unique(labels.rows.map(r => r?.id))
  )
    reasons.push('human-labels-missing-or-unapproved');
  const h = cal?.heldout;
  if (
    cal?.kind !== 'calibration' ||
    cal?.issue !== 'JOV-6476' ||
    cal?.status !== 'calibrated' ||
    !text(cal?.ownerRef) ||
    !text(cal?.receiptId) ||
    cal?.targetDigest !== targetDigest ||
    !text(cal?.version) ||
    /provisional/iu.test(cal.version) ||
    cal?.decision !== 'eligible-for-bounded-canary' ||
    !WRITING_QUALITY_AXES.every(
      axis => finite(cal?.minConfidence?.[axis]) && cal.minConfidence[axis] <= 1
    ) ||
    h?.labelProvenance !== 'human-adjudicated' ||
    h?.humanLabelsApprovalRef !== labels?.sourceOwnerApprovalRef ||
    h?.excludedFromWriterPrompts !== true ||
    h?.digest !== revisionEvidenceDigest(corpus.holdout) ||
    !sameSet(h?.tuningDocumentIds, [
      ...new Set(corpus.tuning.map(e => e.documentId)),
    ]) ||
    !sameSet(h?.holdoutDocumentIds, [
      ...new Set(corpus.holdout.map(e => e.documentId)),
    ]) ||
    !Number.isFinite(h?.limitsDeclaredAt) ||
    !Number.isFinite(h?.openedAt) ||
    !(h.limitsDeclaredAt < h.openedAt && h.openedAt <= cal.issuedAt) ||
    !(cal.expiresAt > cal.issuedAt)
  )
    reasons.push('calibration-missing-provisional-or-mismatched');
  if (
    !limits ||
    !Number.isSafeInteger(limits.minPairs) ||
    limits.minPairs <= 0 ||
    !(limits.minUsefulnessDelta > 0) ||
    ![
      'minUsefulnessDelta',
      'minVoiceDelta',
      'maxP95LatencyMs',
      'maxCostPerExampleUsd',
    ].every(k => finite(limits[k])) ||
    ![
      'maxFactualFalseAcceptance',
      'maxIntroducedDrift',
      'maxPreservationFailures',
      'maxAbstentionRate',
      'maxFallbackRate',
    ].every(k => finite(limits[k]) && limits[k] <= 1) ||
    limits.declaredAt !== h?.limitsDeclaredAt ||
    h?.predeclaredLimitsDigest !== revisionEvidenceDigest(limits ?? null)
  )
    reasons.push('predeclared-surface-limits-missing-or-mismatched');
  const tuningDocs = corpus.tuning.map(e => e.documentId);
  if (
    !text(context?.ownerRef) ||
    !text(context?.archiveRef) ||
    !strings(context?.documentIds) ||
    context.documentIds.some(id => !tuningDocs.includes(id)) ||
    !strings(context?.prompts) ||
    !context.prompts.length ||
    !strings(context?.demonstrations) ||
    !strings(context?.revisionInstructions)
  ) {
    reasons.push('writer-context-provenance-missing');
  } else {
    const instructions = [
      ...context.prompts,
      ...context.demonstrations,
      ...context.revisionInstructions,
    ].map(normalized);
    if (
      corpus.holdout.some(e =>
        instructions.some(s => s.includes(normalized(e.text)))
      )
    )
      reasons.push('heldout-text-in-writer-context');
  }
  return targetDigest;
}

function validLabel(label, candidate, revised) {
  return candidate === null
    ? label === null
    : text(candidate) &&
        label?.textSha256 === revisionTextDigest(candidate) &&
        ['usefulness', 'voice'].every(
          k => Number.isInteger(label[k]) && label[k] >= 0 && label[k] <= 4
        ) &&
        typeof label.factual === 'boolean' &&
        (!revised ||
          (typeof label.introducedDrift === 'boolean' &&
            typeof label.preservationFailure === 'boolean'));
}

function validateRuns(input, corpus, targetDigest, reasons) {
  const runs = input.runs;
  if (!Array.isArray(runs) || runs.length > MAX_REVISION_EXAMPLES) {
    reasons.push('recorded-runs-missing-or-unbounded');
    return [];
  }
  const ids = corpus.holdout.map(e => e.id);
  if (
    !sameSet(
      runs.map(r => r?.id),
      ids
    ) ||
    !unique(runs.map(r => r?.receiptId))
  )
    reasons.push('missing-duplicate-or-unmatched-heldout-runs');
  const requestIds = new Set();
  const responseIds = new Set();
  const usable = [];
  for (const run of runs) {
    const example = corpus.holdout.find(e => e.id === run?.id);
    if (!example) continue;
    const mark = reason => reasons.push(`${reason}:${example.id}`);
    if (run.baseline?.text !== example.text)
      mark('baseline-corpus-artifact-mismatch');
    if (
      run.execution !== 'gateway' ||
      !text(run.ownerRef) ||
      !text(run.archiveRef) ||
      !text(run.receiptId) ||
      run.targetDigest !== targetDigest ||
      run.calibrationDigest !==
        revisionEvidenceDigest(input.calibration ?? null) ||
      run.promptContextDigest !==
        revisionEvidenceDigest(input.promptContext ?? null) ||
      !Number.isFinite(run.recordedAt) ||
      !(
        run.recordedAt >= input.calibration?.issuedAt &&
        run.recordedAt < input.calibration?.expiresAt
      )
    )
      mark('executed-model-evidence-missing-or-mismatched');
    const funding = run.funding;
    if (
      funding?.status !== 'approved' ||
      !text(funding?.receiptRef) ||
      funding?.targetDigest !== targetDigest ||
      !finite(funding?.maxCostUsd) ||
      !(
        funding?.issuedAt <= run.recordedAt &&
        funding?.expiresAt > run.recordedAt
      )
    )
      mark('funding-evidence-missing');
    if (
      ![0, 1].includes(run.revisionCount) ||
      ![null, 'timeout', 'budget'].includes(run.failure)
    )
      mark('invalid-revision-or-failure-count');
    let phasesValid = true;
    for (const phase of ['baseline', 'revised']) {
      const p = run[phase];
      if (
        !state(p?.state) ||
        !finite(p?.latencyMs) ||
        !Array.isArray(p?.calls) ||
        p.calls.length > 2 ||
        !(p.text === null || (text(p.text) && p.text.length <= 20_000)) ||
        (p.state !== 'abstain' && p.text === null)
      ) {
        mark(`invalid-${phase}-artifact`);
        phasesValid = false;
        continue;
      }
      if (
        p.calls.some(c => !['writer', 'judge'].includes(c?.role)) ||
        !unique(p.calls.map(c => c?.role))
      )
        mark('repeated-or-unknown-model-call');
      for (const c of p.calls) {
        const writer = c?.role === 'writer';
        if (
          !text(c?.requestId) ||
          requestIds.has(c.requestId) ||
          !['succeeded', 'timeout', 'error'].includes(c?.status) ||
          (c.status === 'succeeded' &&
            (!text(c.responseId) || responseIds.has(c.responseId))) ||
          c.modelId !==
            (writer
              ? input.target?.writerModel
              : input.target?.resolvedModel) ||
          c.provider !==
            (writer
              ? input.target?.writerProvider
              : input.target?.judgeProvider) ||
          !finite(c.latencyMs) ||
          !Number.isSafeInteger(c.inputTokens) ||
          c.inputTokens < 0 ||
          !Number.isSafeInteger(c.outputTokens) ||
          c.outputTokens < 0
        )
          mark('call-execution-evidence-invalid');
        requestIds.add(c?.requestId);
        if (c?.responseId) responseIds.add(c.responseId);
        if (!finite(c?.costUsd)) mark('attributable-cost-unknown');
      }
      const succeeded = role =>
        p.calls.some(c => c?.role === role && c.status === 'succeeded');
      if (phase === 'baseline' && (!succeeded('writer') || !succeeded('judge')))
        mark('baseline-execution-incomplete');
      if (phase === 'revised') {
        const safeFailure =
          p.state === 'abstain' && p.text === null && run.failure !== null;
        const template = p.state === 'fallback' && text(p.approvedTemplateRef);
        if (p.state === 'fallback' && !template) mark('unapproved-fallback');
        if (
          run.revisionCount === 0 &&
          (p.calls.length ||
            (!safeFailure && !template && p.text !== run.baseline?.text))
        )
          mark('unrecorded-revision');
        if (
          run.revisionCount === 1 &&
          (!p.calls.some(c => c?.role === 'writer') ||
            (p.text !== null && !template && !succeeded('writer')))
        )
          mark('revision-execution-incomplete');
        if (
          run.revisionCount === 1 &&
          p.state === 'accepted' &&
          !succeeded('judge')
        )
          mark('accepted-without-recheck');
      }
    }
    if (!phasesValid) continue;
    const calls = [...run.baseline.calls, ...run.revised.calls];
    if (
      calls.every(c => finite(c?.costUsd)) &&
      calls.reduce((sum, c) => sum + c.costUsd, 0) > funding?.maxCostUsd
    )
      mark('funding-budget-exceeded');
    const label = Array.isArray(input.labels?.rows)
      ? input.labels.rows.find(r => r?.id === run.id)
      : null;
    const labelsValid =
      text(label?.adjudicatorRef) &&
      text(label?.labelRef) &&
      validLabel(label.baseline, run.baseline.text, false) &&
      validLabel(label.revised, run.revised.text, true);
    if (!labelsValid) mark('missing-or-mismatched-human-label');
    if (
      labelsValid &&
      run.baseline.text === run.revised.text &&
      ['usefulness', 'voice', 'factual'].some(
        k => label.baseline[k] !== label.revised[k]
      )
    )
      mark('unchanged-candidate-label-disagreement');
    usable.push({ run, example, label: labelsValid ? label : null });
  }
  if (
    Array.isArray(input.labels?.rows) &&
    !sameSet(
      input.labels.rows.map(r => r?.id),
      ids
    )
  )
    reasons.push('missing-duplicate-or-unmatched-human-labels');
  return usable;
}

export function validateRevisionEvidence(input, reasons) {
  const corpus = validateCorpus(input, reasons);
  const rows = corpus
    ? validateRuns(
        input,
        corpus,
        validateOwners(input, corpus, reasons),
        reasons
      )
    : [];
  return { corpus, rows };
}
