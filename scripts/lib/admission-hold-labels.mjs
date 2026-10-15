// One vocabulary for the labels that stop native merge-queue admission.
//
// The single source is admission-hold-labels.json, read here and by the lanes
// (scripts/lanes/pr_events.py) so no consumer keeps its own list.
//
// Stop labels are explicit intent from a person or agent. Each one is governed
// by the hold contract (scripts/hold-contract.mjs, jovie-hold/v1): it needs a
// receipt naming an owner and a machine-checkable release, or it is removed
// after the ownerless grace period. `queue-poison` and `machineBlockLabels`
// (`lane-fix-red`) are machine state, not hold-contract labels. Green enroll
// removes `lane-fix-red` once the current head is required-green, then admits
// that head. A red head keeps the label.
//
// Workflow `if:` expressions and the checkout-free auto-merge enable step
// cannot read the file, so they repeat the list;
// scripts/lib/__tests__/admission-hold-labels.test.mjs fails when a copy drifts.
import { readFileSync } from 'node:fs';

export const HOLD_LABELS_SCHEMA = 'jovie-admission-hold-labels/v1';

/** Fails closed: an unreadable or malformed file throws at import. */
export function parseHoldLabels(text) {
  const raw = JSON.parse(text);
  const isLabel = value =>
    typeof value === 'string' && value === value.trim().toLowerCase() && value;
  if (
    raw?.schema !== HOLD_LABELS_SCHEMA ||
    !Array.isArray(raw.stopHoldLabels) ||
    raw.stopHoldLabels.length === 0 ||
    !raw.stopHoldLabels.every(isLabel) ||
    new Set(raw.stopHoldLabels).size !== raw.stopHoldLabels.length ||
    !isLabel(raw.queuePoisonLabel) ||
    raw.stopHoldLabels.includes(raw.queuePoisonLabel) ||
    !Array.isArray(raw.machineBlockLabels) ||
    raw.machineBlockLabels.length === 0 ||
    !raw.machineBlockLabels.every(isLabel) ||
    new Set(raw.machineBlockLabels).size !== raw.machineBlockLabels.length ||
    raw.machineBlockLabels.some(
      label =>
        raw.stopHoldLabels.includes(label) || label === raw.queuePoisonLabel
    )
  ) {
    throw new Error(`admission-hold-labels.json is not ${HOLD_LABELS_SCHEMA}`);
  }
  return raw;
}

const labels = parseHoldLabels(
  readFileSync(new URL('./admission-hold-labels.json', import.meta.url), 'utf8')
);

export const STOP_HOLD_LABELS = Object.freeze([...labels.stopHoldLabels]);

export const QUEUE_POISON_LABEL = labels.queuePoisonLabel;

export const MACHINE_BLOCK_LABELS = Object.freeze([
  ...labels.machineBlockLabels,
]);

/** Labels that keep a PR out of the merge queue and out of auto-merge. */
export const ADMISSION_BLOCKING_LABELS = Object.freeze([
  ...STOP_HOLD_LABELS,
  QUEUE_POISON_LABEL,
  ...MACHINE_BLOCK_LABELS,
]);
