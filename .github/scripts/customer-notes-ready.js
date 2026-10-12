// Narrow draft handoff inside the existing auto-merge owner. No scheduler: the
// auto-merge-default.yml customer-notes job runs it when a required-check
// workflow completes on the release/daily-changelog-* branch.
const REQUIRED = [
  'PR Ready',
  'Migration Guard',
  'Fork PR Gate',
  'PR Size Guard',
];
// Single source: scripts/lib/admission-hold-labels.json.
const HOLD_LABELS = require('../../scripts/lib/admission-hold-labels.json');
const BLOCKING_LABELS = new Set([
  ...HOLD_LABELS.stopHoldLabels,
  HOLD_LABELS.queuePoisonLabel,
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
// One open PR per head branch, in the shape finishCustomerNotes reads.
function customerNotesForBranch(repo, branch, dryRun, command) {
  const prs = JSON.parse(
    command([
      'pr',
      'list',
      '--repo',
      repo,
      '--head',
      branch,
      '--state',
      'open',
      '--json',
      'number,isDraft,isCrossRepository,baseRefName,headRefName,headRefOid,files,labels',
    ])
  ).map(pr => ({
    ...pr,
    files: { totalCount: pr.files.length, nodes: pr.files },
    labels: { nodes: pr.labels },
  }));
  finishCustomerNotes(repo, prs, dryRun, command);
  return prs.filter(pr => pr.customerNotesReadyHead).map(pr => pr.number);
}
function main(argv, command) {
  const value = flag => argv[argv.indexOf(flag) + 1];
  const repo = value('--repo');
  const branch = value('--branch');
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo ?? '') || !branch?.startsWith('release/'))
    throw new Error(
      'usage: --repo owner/name --branch release/... [--dry-run]'
    );
  const ready = customerNotesForBranch(
    repo,
    branch,
    argv.includes('--dry-run'),
    command
  );
  console.log(
    `Customer-notes handoff for ${branch}: ready=[${ready.join(',')}]`
  );
  return ready;
}
/* node:coverage ignore next 9 */
if (require.main === module) {
  const { execFileSync } = require('node:child_process');
  main(process.argv.slice(2), args =>
    execFileSync('gh', args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'inherit'],
    })
  );
}
module.exports = {
  finishCustomerNotes,
  customerNotesForBranch,
  main,
  BLOCKING_LABELS,
};
