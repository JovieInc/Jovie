// Narrow draft handoff inside the existing auto-merge owner. No new scheduler.
const REQUIRED = [
  'PR Ready',
  'Migration Guard',
  'Fork PR Gate',
  'PR Size Guard',
];
const BLOCKING_LABELS = new Set([
  'hold',
  'gated',
  'incident',
  'do-not-merge',
  'queue-poison',
]);
function finishCustomerNotes(repo, prs, dryRun, command) {
  for (const pr of prs) {
    if (
      !pr.isDraft ||
      pr.isCrossRepository ||
      pr.baseRefName !== 'main' ||
      !/^release\/daily-changelog-\d{4}-\d{2}-\d{2}(?:-\d+-\d+)?$/.test(
        pr.headRefName
      ) ||
      pr.files?.totalCount !== 1 ||
      pr.files.nodes[0]?.path !== 'CHANGELOG.md' ||
      (pr.labels?.nodes ?? []).some(label =>
        BLOCKING_LABELS.has(label.name.toLowerCase())
      )
    )
      continue;
    // gh returns nonzero for pending/failing checks: leave the draft untouched.
    let checks;
    try {
      checks = JSON.parse(
        command([
          'pr',
          'checks',
          String(pr.number),
          '--repo',
          repo,
          '--required',
          '--json',
          'name,bucket',
        ])
      );
    } catch {
      continue;
    }
    if (
      !REQUIRED.every(name =>
        checks.some(check => check.name === name && check.bucket === 'pass')
      ) ||
      checks.some(check => check.bucket !== 'pass')
    )
      continue;
    try {
      const fresh = JSON.parse(
        command([
          'pr',
          'view',
          String(pr.number),
          '--repo',
          repo,
          '--json',
          'headRefOid',
        ])
      );
      if (fresh.headRefOid !== pr.headRefOid || dryRun) continue;
      command(['pr', 'ready', String(pr.number), '--repo', repo]);
    } catch {
      console.warn(
        `PR #${pr.number}: customer-note handoff deferred; the existing owner will retry.`
      );
      continue;
    }
    // The normal enable pass owns auto-merge; its ready event also provides a retry.
    pr.isDraft = false;
    pr.customerNotesReadyHead = pr.headRefOid;
  }
}
module.exports = { finishCustomerNotes, BLOCKING_LABELS };
