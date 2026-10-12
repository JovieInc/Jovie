// One vocabulary for the labels that stop native merge-queue admission.
//
// Stop labels are explicit intent from a person or agent. Each one is governed
// by the hold contract (scripts/hold-contract.mjs, jovie-hold/v1): it needs a
// receipt naming an owner and a machine-checkable release, or it is removed
// after the ownerless grace period. `queue-poison` is machine state written by
// the lanes (scripts/lanes/pr_events.py) and removed by their fix push.
//
// Workflow `if:` expressions and CommonJS scripts cannot import this module, so
// they repeat the list; scripts/lib/__tests__/admission-hold-labels.test.mjs
// fails when any copy drifts from these sets.
export const STOP_HOLD_LABELS = Object.freeze([
  'hold',
  'gated',
  'incident',
  'do-not-merge',
  'tim-hold',
  'tim:hold',
  'hold:tim',
]);

export const QUEUE_POISON_LABEL = 'queue-poison';

/** Labels that keep a PR out of the merge queue and out of auto-merge. */
export const ADMISSION_BLOCKING_LABELS = Object.freeze([
  ...STOP_HOLD_LABELS,
  QUEUE_POISON_LABEL,
]);
