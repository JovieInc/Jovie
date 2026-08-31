const DEFAULT_PAGE_SIZE = 100;

function assertConnection(response, branch) {
  const repository = response?.data?.repository;
  if (!repository) {
    throw new Error(
      `GraphQL native merge-queue inventory omitted repository for ${branch}`
    );
  }

  // A repository may only configure a merge queue for some base branches.
  // A missing queue is therefore a complete empty inventory, not degradation.
  if (repository.mergeQueue === null) return null;

  const entries = repository.mergeQueue?.entries;
  if (
    !Array.isArray(entries?.nodes) ||
    typeof entries?.pageInfo?.hasNextPage !== 'boolean'
  ) {
    throw new Error(
      `GraphQL native merge-queue inventory was incomplete for ${branch}`
    );
  }
  if (entries.pageInfo.hasNextPage && !entries.pageInfo.endCursor) {
    throw new Error(
      `GraphQL native merge-queue inventory omitted its cursor for ${branch}`
    );
  }
  return entries;
}

/**
 * Fetch native merge-queue ownership once per base branch, not once per PR.
 *
 * `request` receives GraphQL variables so callers can isolate this low-cost
 * read on the workflow-scoped token while preserving the App token for the
 * later trusted writer. Returning a map makes every non-entry explicitly
 * queue-free only after the complete paginated inventory has been read.
 */
export async function fetchNativeMergeQueue({
  branches,
  request,
  pageSize = DEFAULT_PAGE_SIZE,
}) {
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
    throw new Error('merge-queue pageSize must be an integer from 1 to 100');
  }

  const positions = new Map();
  for (const branch of [...new Set(branches)].sort()) {
    if (!branch) {
      throw new Error('merge-queue inventory requires a base branch');
    }

    let cursor = null;
    do {
      const response = await request({ branch, cursor, pageSize });
      const entries = assertConnection(response, branch);
      if (entries === null) break;

      for (const node of entries.nodes) {
        const number = node?.pullRequest?.number;
        const position = node?.position;
        if (!Number.isInteger(number) || number < 1) {
          throw new Error(
            `GraphQL native merge-queue inventory contained an invalid PR for ${branch}`
          );
        }
        if (!Number.isInteger(position) || position < 1) {
          throw new Error(
            `GraphQL native merge-queue inventory contained an invalid position for PR #${number}`
          );
        }
        positions.set(number, position);
      }

      cursor = entries.pageInfo.hasNextPage ? entries.pageInfo.endCursor : null;
    } while (cursor !== null);
  }

  return positions;
}

export function annotateNativeMergeQueue(prs, positions) {
  for (const pr of prs) {
    const position = positions.get(pr.number) ?? null;
    pr.isInMergeQueue = position !== null;
    pr.mergeQueuePosition = position;
  }
  return prs;
}
