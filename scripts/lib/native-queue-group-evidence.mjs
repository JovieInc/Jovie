import { evaluateProductLaneResults } from './product-lane-classifier.mjs';

/** Derive selected-suite proof from GitHub's exact job log and lane artifact. */
export function groupEvidenceFailures(m) {
  const e = m?.gateEvidence,
    errors = [];
  const require = (ok, reason) => {
    if (!ok) errors.push(reason);
  };
  if (
    !e?.readyJob ||
    typeof e.readyLog !== 'string' ||
    !e.laneReceipt ||
    !e.artifact
  )
    return ['group-evidence-missing'];
  const job = e.readyJob,
    lane = e.laneReceipt;
  require(Number.isSafeInteger(m.number) &&
    m.number > 0 &&
    /^[a-f0-9]{40}$/.test(m.groupHead ?? '') &&
    Number.isSafeInteger(m.run?.id) &&
    m.run.id > 0 &&
    Number.isSafeInteger(m.run?.run_attempt) &&
    m.run.run_attempt > 0, 'group-identity');
  require(job.run_id === m.run?.id &&
    job.run_attempt === m.run?.run_attempt &&
    job.head_sha === m.groupHead &&
    job.name === 'PR Ready' &&
    job.status === 'completed' &&
    job.conclusion === 'success', 'ready-job-binding');
  require(e.artifact.workflow_run?.id === m.run?.id &&
    e.artifact.workflow_run?.head_sha === m.groupHead &&
    e.artifact.expired === false &&
    e.artifact.name ===
      `product-lane-final-${m.groupHead}-${m.run?.run_attempt}` &&
    lane.provenance?.sha === m.groupHead &&
    String(lane.provenance?.runId) === String(m.run?.id) &&
    String(lane.provenance?.runAttempt) ===
      String(m.run?.run_attempt), 'lane-artifact-binding');
  const log = e.readyLog.replace(/\u001b\[[0-9;]*m/g, '');
  const values = {};
  for (const match of log.matchAll(/\b([A-Z_]+)="([^"\n]*)"/g)) {
    require(!Object.hasOwn(values, match[1]), `ambiguous-log:${match[1]}`);
    values[match[1]] = match[2];
  }
  require(values.ADMISSION_ADMITTED === 'true' &&
    values.ADMISSION_OBSOLETE === 'false' &&
    values.ADMISSION_SYNTHETIC_HEAD === m.groupHead &&
    values.ADMISSION_PR === String(m.number), 'live-group-admission');
  for (const name of [
    'PATH',
    'ADMISSION',
    'RISK',
    'FAST',
    'SECRET',
    'GOLDEN_PATH_LOCK',
    'VISUAL_COMPARE',
    'MIGRATION',
    'LANE_RECEIPT',
  ])
    require(values[`${name}_RESULT`] === 'success', `group-gate:${name}`);
  for (const [selected, result] of [
    ['RUN_WEB', 'UNIT_RESULT'],
    ['RUN_WEB', 'BUILD_LAYOUT_RESULT'],
    ['RUN_IOS', 'IOS_RESULT'],
    ['RUN_MACOS', 'MACOS_RESULT'],
    ['RUN_CROSS_PRODUCT', 'CROSS_PRODUCT_RESULT'],
    ['RUN_PROMPTFOO', 'PROMPTFOO_RESULT'],
    ['RUN_GOLDEN_EVAL', 'GOLDEN_EVAL_RESULT'],
  ]) {
    require(['true', 'false'].includes(values[selected]) &&
      values[result] ===
        (values[selected] === 'true'
          ? 'success'
          : 'skipped'), `selected-suite:${result}`);
  }
  try {
    require(evaluateProductLaneResults(lane, lane.actualResults?.lanes)
      .aggregatePassed, 'lane-results');
  } catch {
    errors.push('lane-results-unavailable');
  }
  require(Array.isArray(lane.selectedLanes) &&
    new Set(lane.selectedLanes).size === lane.selectedLanes.length &&
    lane.selectedLanes.every(name =>
      ['web', 'ios', 'mac', 'operations', 'cross-product'].includes(name)
    ) &&
    lane.selectedLanes.join(',') ===
      values.SELECTED_LANES, 'lane-selection-mismatch');
  for (const [name, flag] of [
    ['web', 'RUN_WEB'],
    ['ios', 'RUN_IOS'],
    ['mac', 'RUN_MACOS'],
    ['cross-product', 'RUN_CROSS_PRODUCT'],
  ]) {
    require(Array.isArray(lane.selectedLanes) &&
      lane.selectedLanes.includes(name) ===
        (values[flag] === 'true'), `lane-flag-mismatch:${name}`);
  }
  return errors;
}
