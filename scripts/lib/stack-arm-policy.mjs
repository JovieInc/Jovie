// Policy for arming a PR after its stacked parent merged, and the base guard
// that keeps auto-merge off any PR whose base is not main.
//
// Used by scripts/unstack-merged-parent.sh (CLI: reads PR JSON on stdin, prints
// one action word) and by the auto-merge base guard workflow. Pure functions so
// the decision is testable without GitHub.
import { ADMISSION_BLOCKING_LABELS } from './admission-hold-labels.mjs';

export const ARM_BASE = 'main';

/** Auto-merge or enqueue is only legitimate for a PR that targets main. */
export function autoMergeBaseViolation(baseRefName) {
  return baseRefName === ARM_BASE ? null : `base=${baseRefName || 'missing'}`;
}

/**
 * @param {{state?:string,isDraft?:boolean,baseRefName?:string,mergeStateStatus?:string,
 *   labels?:Array<string|{name:string}>,autoMergeEnabled?:boolean,inQueue?:boolean}} pr
 * @returns {'enqueue'|'auto-merge'|`skip:${string}`}
 */
export function armAction(pr) {
  if (pr.state !== 'OPEN') return 'skip:not-open';
  const violation = autoMergeBaseViolation(pr.baseRefName);
  if (violation) return `skip:${violation}`;
  if (pr.isDraft !== false) return 'skip:draft';
  const labels = (pr.labels ?? []).map(l =>
    (typeof l === 'string' ? l : l.name).toLowerCase()
  );
  const held = labels.filter(l => ADMISSION_BLOCKING_LABELS.includes(l));
  if (held.length > 0) return `skip:held(${held.join(',')})`;
  if (pr.inQueue) return 'skip:already-queued';
  if (pr.mergeStateStatus === 'CLEAN') return 'enqueue';
  if (pr.mergeStateStatus === 'DIRTY') return 'skip:conflict';
  if (pr.autoMergeEnabled) return 'skip:already-armed';
  return 'auto-merge';
}

if (process.argv[1] === import.meta.filename) {
  let input = '';
  for await (const chunk of process.stdin) input += chunk;
  console.log(armAction(JSON.parse(input)));
}
