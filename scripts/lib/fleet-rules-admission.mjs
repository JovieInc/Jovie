// JOV-9966: source readiness does not include the PR-lane token-budget guard.
// Extend the existing current-head read; never infer this proof from PR Ready.
// Schema: https://docs.github.com/en/graphql/reference/actions#workflowrun
export const FLEET_RULES_COMMIT_FIELDS = `oid statusCheckRollup {
  state contexts(first:100) {
    pageInfo { hasNextPage }
    nodes { __typename ... on CheckRun {
      databaseId name status conclusion
      checkSuite { app { databaseId } workflowRun {
        databaseId runAttempt event file { path repositoryName }
      } }
    } }
  }
}`;

/** Complete, exact-head proof from the authoritative GitHub Actions workflow. */
export function fleetRulesAdmission(commit, expectedHead, repository) {
  const hold = reason => ({ allowed: false, reason });
  if (
    !/^[a-f0-9]{40}$/.test(expectedHead ?? '') ||
    commit?.oid !== expectedHead
  )
    return hold('fleet-rules-head-mismatch');
  const contexts = commit.statusCheckRollup?.contexts;
  if (
    contexts?.pageInfo?.hasNextPage !== false ||
    !Array.isArray(contexts.nodes)
  )
    return hold('fleet-rules-incomplete');
  const named = contexts.nodes.filter(
    check =>
      check?.__typename === 'CheckRun' &&
      check.name === 'PR Fleet Rules' &&
      check.checkSuite?.app?.databaseId === 15368
  );
  if (!named.length) return hold('fleet-rules-missing');
  // A missing producer identity cannot be treated as an older unrelated green.
  if (
    named.some(
      check =>
        !Number.isSafeInteger(check.databaseId) ||
        !Number.isSafeInteger(check.checkSuite?.workflowRun?.databaseId) ||
        !check.checkSuite.workflowRun.event ||
        !check.checkSuite.workflowRun.file?.path ||
        !check.checkSuite.workflowRun.file?.repositoryName
    )
  )
    return hold('fleet-rules-unreadable');
  const trusted = named.filter(check => {
    const run = check.checkSuite.workflowRun;
    return (
      run.event === 'pull_request' &&
      run.file?.path === '.github/workflows/pr-fleet-rules.yml' &&
      run.file?.repositoryName === repository
    );
  });
  if (!trusted.length) return hold('fleet-rules-producer-mismatch');
  const latest = trusted.reduce((a, b) =>
    a.databaseId > b.databaseId ? a : b
  );
  if (latest.status !== 'COMPLETED' || latest.conclusion !== 'SUCCESS')
    return hold('fleet-rules-not-green');
  return { allowed: true, reason: 'fleet-rules-current-head-green' };
}
