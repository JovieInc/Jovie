// Failing-head eject episode: required-check detection, dequeue decision,
// comment body, and post-dequeue label/status/comment (JOV-6620 / #26143).
import { FIX_RED_LABEL, marker } from './main-red-eject.mjs';

/** Required merge-group contexts (CI / PR Ready aggregates ci-fast, so a red ci-fast guarantees it). */
export const REQUIRED_CHECK_NAMES = Object.freeze([
  'PR Ready',
  'Migration Guard',
  'Fork PR Gate',
  'PR Size Guard',
  'Company guards',
]);
export const REQUIRED_CHECK_PREFIXES = Object.freeze(['ci-fast (']);

const isRequiredCheck = name => {
  const bare = String(name).replace(/^CI \/ /, '');
  return (
    REQUIRED_CHECK_NAMES.includes(bare) ||
    REQUIRED_CHECK_PREFIXES.some(p => bare.startsWith(p))
  );
};

/**
 * Required checks whose latest run on the merge-group head concluded FAILURE.
 * @param {Array<{id:number, name:string, conclusion:string|null}>} checkRuns
 * @returns {string[]} sorted names
 */
export function failingRequiredChecks(checkRuns = []) {
  const latest = new Map();
  for (const c of checkRuns) {
    const prev = latest.get(c.name);
    if (!prev || c.id > prev.id) latest.set(c.name, c);
  }
  return [...latest.values()]
    .filter(c => c.conclusion === 'failure' && isRequiredCheck(c.name))
    .map(c => c.name)
    .sort();
}

/**
 * A queue head with a failed required check blocks everyone behind it even
 * though GitHub never ejects it (#23966: 5 h). Dequeue only when main is green,
 * so a red main stays the revert path's business. Never re-enqueues, never jumps.
 * @param {{head?: {number:number, position:number, state:string, sha?:string|null}|null, failing: string[], mainGreen: boolean}} input
 */
export function decideFailingHead({ head, failing, mainGreen }) {
  const no = reason => ({ dequeue: false, reason });
  if (!head || head.position !== 1) return no('no-head');
  if (!failing.length) return no('no-failed-required-check');
  if (!mainGreen) return no('main-not-green');
  return { dequeue: true, reason: 'required-check-failed', failing };
}

/** PR tip for hold receipts — never the merge-group synthetic `head.sha`. */
export const ejectHoldSha = head => head?.headRefOid ?? null;

export const failingHeadComment = (head, failing, { labeled = true } = {}) =>
  `${marker({ failingHeadDequeued: ejectHoldSha(head) })}\nRemoved from the merge queue: required check${failing.length === 1 ? '' : 's'} failed on the merge group (${failing.map(n => `\`${n}\``).join(', ')}) while main CI is green. This exact head will not re-enter the queue (JOV-6620). ${labeled ? 'Push a new commit that fixes the merge-group failure; `lane-fix-red` keeps the repair lane owning it until that new head is green.' : 'Push a new commit that fixes the merge-group failure (repair-label apply failed on this wake — still blocked from same-head re-enroll by JOV-6620).'}`;

/** Commit-status context reconcile reads for a failing-head eject hold (JOV-6620). */
export const EJECT_HOLD_CONTEXT = 'jovie-merge-group-eject-hold/v1';

/**
 * After dequeue: label lane-fix-red, stamp eject-hold status, comment.
 * Status goes on PR headRefOid so reconcile's eject_held(headRefOid) finds it
 * (merge-group headCommit.oid differs — Sentry #26143 HIGH).
 * @param {{ gh: (args: string[]) => Promise<unknown>, repo: string, head: {number:number, sha?:string|null, headRefOid?:string|null}, failing: string[], label?: string }} input
 */
export async function applyFailingHeadEpisode({
  gh,
  repo,
  head,
  failing,
  label = FIX_RED_LABEL,
}) {
  let labeled = false;
  try {
    await gh([
      'api',
      '-X',
      'POST',
      `repos/${repo}/issues/${head.number}/labels`,
      '-f',
      `labels[]=${label}`,
    ]);
    labeled = true;
  } catch (error) {
    console.error(`::warning::failing-head ${label} failed: ${error.message}`);
  }
  const holdSha = ejectHoldSha(head);
  let held = false;
  if (labeled && holdSha) {
    try {
      await gh([
        'api',
        '-X',
        'POST',
        `repos/${repo}/statuses/${holdSha}`,
        '-f',
        'state=success',
        '-f',
        `context=${EJECT_HOLD_CONTEXT}`,
        '-f',
        `description=failing-head eject hold on #${head.number}`,
      ]);
      held = true;
    } catch (error) {
      // Warn-only left an unlabeled receipt: reconcile clears lane-fix-red.
      // Drop the label so we do not claim a hold we cannot prove (Sentry #26143).
      console.error(
        `::warning::failing-head eject-hold status failed: ${error.message}`
      );
      await gh([
        'api',
        '-X',
        'DELETE',
        `repos/${repo}/issues/${head.number}/labels/${label}`,
      ]).catch(undoError =>
        console.error(
          `::warning::failing-head label undo after status failure failed: ${undoError.message}`
        )
      );
      labeled = false;
    }
  } else if (labeled && !holdSha) {
    console.error(
      '::warning::failing-head eject-hold skipped: missing pullRequest.headRefOid'
    );
    await gh([
      'api',
      '-X',
      'DELETE',
      `repos/${repo}/issues/${head.number}/labels/${label}`,
    ]).catch(undoError =>
      console.error(
        `::warning::failing-head label undo without headRefOid failed: ${undoError.message}`
      )
    );
    labeled = false;
  }
  await gh([
    'api',
    '-X',
    'POST',
    `repos/${repo}/issues/${head.number}/comments`,
    '-f',
    `body=${failingHeadComment(head, failing, { labeled })}`,
  ]).catch(error =>
    console.error(`::warning::failing-head comment failed: ${error.message}`)
  );
  return { labeled, held };
}
