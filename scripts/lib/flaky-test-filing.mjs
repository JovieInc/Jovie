export const FLAKY_FILING_FINGERPRINT = 'remediation:flaky-test-filing';
export const RETIRED_GITHUB_FILING_SENTINEL = '__retired_linear_only__';

export function githubIssueFilingRetired(workflowSource) {
  return String(workflowSource ?? '').includes(
    `github.event_name == '${RETIRED_GITHUB_FILING_SENTINEL}'`
  );
}

export function planFlakyTestFiling({
  workflowSource,
  ratchetFailed,
  flakyCount = '0',
  runUrl = '',
}) {
  if (ratchetFailed !== true || !githubIssueFilingRetired(workflowSource))
    return null;
  const fingerprint = FLAKY_FILING_FINGERPRINT;
  return {
    fingerprint,
    title: `Flaky-test ratchet is red while GitHub issue filing is retired (${fingerprint})`,
    description: [
      'Workflow test-flakiness-report.yml. Current issue JOV-6507.',
      runUrl ? `Run: ${runUrl}` : null,
      `Ratchet failed with ${flakyCount} flaky test(s). GitHub issue filing stays retired.`,
      'Reopens while the ratchet is red and GitHub filing stays off.',
      `Fingerprint: \`${fingerprint}\``,
    ]
      .filter(Boolean)
      .join('\n'),
    priority: 2,
    createStateName: 'Todo',
    reopenTerminal: true,
  };
}
