// Per-producer WIP gate for `pr-open open` (policy: scripts/lanes/pr-wip-policy.json).
/**
 * Per-producer WIP admission (scripts/lanes/pr-wip-policy.json, one rule shared with the
 * lanes' new-issue budget): a producer that owns `cap` or more open, unheld PRs may not open
 * another until some land. Exit 3 from pr_wip.py is a refusal; any other failure admits
 * with a warning, because an unreadable count must not stall shipping.
 */
export function wipAdmission(branch, execute, cwd) {
  const result = execute(
    'python3',
    ['scripts/lanes/pr_wip.py', 'admit', '--branch', branch],
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
      message: `wip-cap: \`${decision.producer}/\` already owns ${decision.used} open PRs (cap ${decision.cap}, scripts/lanes/pr-wip-policy.json). Land, fix or close one of them before opening another.`,
    };
  return {
    allowed: true,
    message:
      result.status === 0 && decision
        ? null
        : `wip admission unavailable (${(result.stderr || 'no decision').toString().trim().slice(0, 160)}); admitting`,
  };
}

/**
 * Admission plus the visible override: `--wip-override "<reason>"` (12+ chars) is recorded
 * and labels the PR `wip-override` so the census can count it. Lane runs never pass it.
 */
export function wipGate(a, branch, { execute, log, record }) {
  const wip = wipAdmission(branch, execute, a.repo);
  const override = !wip.allowed && (a.wipOverride ?? '').trim().length >= 12;
  record({
    cmd: 'wip-admission',
    branch,
    allowed: wip.allowed,
    ...(override ? { override: a.wipOverride } : {}),
  });
  if (wip.message)
    log(`${wip.allowed || override ? 'warn' : 'FAIL'}  ${wip.message}`);
  const refused = !wip.allowed && !override;
  if (refused)
    log(
      'Refusing to open: over the WIP cap (--wip-override "<reason>" is recorded and labelled).'
    );
  return { refused, override };
}
