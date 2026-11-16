// Canonical prospective capacity gate for `pr-open open`.
/**
 * Uses the same observed capacity as the lanes' new-issue budget. Actual calls reserve
 * quota through the shared client. Missing evidence is provisional, never a claim of
 * unlimited capacity. The final request remains bounded and provider-enforced.
 */
export function wipAdmission(branch, execute, cwd, priority = 'default') {
  const result = execute(
    'python3',
    [
      'scripts/lanes/pr_wip.py',
      'admit',
      '--branch',
      branch,
      '--priority',
      priority,
    ],
    { cwd }
  );
  let decision = null;
  try {
    decision = JSON.parse((result.stdout || '').trim().split('\n').pop());
  } catch {
    decision = null;
  }
  if (result.status === 3 && decision)
    return {
      allowed: false,
      reason: decision.reason,
      message:
        decision.reason === 'wip-cap'
          ? `wip-cap: \`${decision.producer}/\` already owns ${decision.used} open PRs (historical cap ${decision.cap}).`
          : `${decision.reason}: current capacity defers this admission${decision.retryAt ? ` until ${new Date(decision.retryAt * 1000).toISOString()}` : ''}.`,
    };
  return {
    allowed: true,
    reason: decision?.reason ?? 'capacity-unknown',
    message:
      result.status === 0 && decision
        ? decision.known === false
          ? 'capacity unknown; existing seats and the bounded API request gate still apply'
          : null
        : `capacity observation unavailable (${(result.stderr || 'no decision').toString().trim().slice(0, 160)}); deferring capacity proof to the bounded API request gate`,
  };
}

/**
 * Admission plus the visible override: `--wip-override "<reason>"` (12+ chars) is recorded
 * and labels the PR `wip-override` so the census can count it. Lane runs never pass it.
 */
export function wipGate(a, branch, { execute, log, record }) {
  const wip = wipAdmission(branch, execute, a.repo, a.capacityPriority);
  const override =
    !wip.allowed &&
    wip.reason === 'wip-cap' &&
    (a.wipOverride ?? '').trim().length >= 12;
  record({
    cmd: 'wip-admission',
    branch,
    allowed: wip.allowed,
    reason: wip.reason,
    priority: a.capacityPriority ?? 'default',
    ...(override ? { override: a.wipOverride } : {}),
  });
  if (wip.message)
    log(`${wip.allowed || override ? 'warn' : 'FAIL'}  ${wip.message}`);
  const refused = !wip.allowed && !override;
  if (refused)
    log(
      'Refusing to open: current capacity is unavailable. A WIP override cannot bypass quota or CI.'
    );
  return { refused, override };
}
