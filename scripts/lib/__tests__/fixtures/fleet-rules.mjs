export function fleetCommit(sha, overrides = {}) {
  return {
    oid: sha,
    statusCheckRollup: {
      state: 'SUCCESS',
      contexts: {
        pageInfo: { hasNextPage: false },
        nodes: [
          {
            __typename: 'CheckRun',
            databaseId: 100,
            name: 'PR Fleet Rules',
            status: 'COMPLETED',
            conclusion: 'SUCCESS',
            checkSuite: {
              app: { databaseId: 15368 },
              workflowRun: {
                databaseId: 10,
                runAttempt: 1,
                event: 'pull_request',
                file: {
                  path: '.github/workflows/pr-fleet-rules.yml',
                  repositoryName: 'JovieInc/Jovie',
                },
              },
            },
            ...overrides,
          },
          ...['PR Ready', 'Fleet Rules Evidence'].map(name => ({
            __typename: 'CheckRun',
            name,
            status: 'COMPLETED',
            conclusion: 'SUCCESS',
            databaseId: 1,
            checkSuite: {
              app: { databaseId: 15368 },
              workflowRun: {
                databaseId: 1,
                runAttempt: 1,
                event: 'pull_request',
                file: {
                  path: '.github/workflows/ci.yml',
                  repositoryName: 'JovieInc/Jovie',
                },
              },
            },
          })),
        ],
      },
    },
  };
}

export function nonGreenFleetProofs(sha) {
  const truncated = fleetCommit(sha);
  truncated.statusCheckRollup.contexts.pageInfo.hasNextPage = true;
  return {
    red: fleetCommit(sha, { conclusion: 'FAILURE' }),
    pending: fleetCommit(sha, { status: 'IN_PROGRESS', conclusion: null }),
    missing: {
      oid: sha,
      statusCheckRollup: {
        state: 'SUCCESS',
        contexts: { pageInfo: { hasNextPage: false }, nodes: [] },
      },
    },
    stale: fleetCommit('f'.repeat(40)),
    unreadable: null,
    truncated,
  };
}
