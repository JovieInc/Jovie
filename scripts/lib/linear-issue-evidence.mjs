/** Paginated evidence reads must prove completion before deduping a write. */
export async function readLinearEvidenceComments(
  { issueId, apiKey, fetchImpl },
  request
) {
  if (!apiKey) return { ok: false, reason: 'missing_linear_api_key' };
  if (!issueId) return { ok: false, reason: 'missing_issue_id' };
  const comments = [];
  let after = null;
  for (let page = 0; page < 10; page++) {
    const result = await request(
      {
        query: `query ListLinearIssueComments($id: String!, $after: String) {
        issue(id: $id) { comments(first: 100, after: $after) {
          nodes { id body createdAt } pageInfo { hasNextPage endCursor }
        } }
      }`,
        variables: { id: issueId, after },
        apiKey,
        fetchImpl,
      },
      'linear_comment_list'
    );
    if (!result.ok) return result;
    const connection = result.data?.issue?.comments;
    comments.push(
      ...(connection?.nodes ?? []).map(node => ({
        id: node?.id ?? null,
        body: String(node?.body ?? ''),
        createdAt: node?.createdAt ?? null,
      }))
    );
    if (connection?.pageInfo?.hasNextPage === false)
      return { ok: true, comments };
    if (connection?.pageInfo?.hasNextPage !== true) break;
    const cursor = connection.pageInfo.endCursor;
    if (!cursor || cursor === after) break;
    after = cursor;
  }
  return { ok: false, reason: 'linear_comments_incomplete' };
}

/** Preserve owner/workpad/disposition while appending each observation once. */
export async function preserveLinearFindingEvidence({
  match,
  evidenceMarker,
  descriptionBody,
  apiKey,
  fetchImpl,
  listComments,
  addComment,
}) {
  const identity = {
    id: match.id,
    identifier: match.identifier,
    url: match.url,
    ...(['completed', 'canceled'].includes(match.state?.type)
      ? { terminal: true }
      : {}),
  };
  // New evidence is retained even after disposition, without reopening it.
  if (
    !evidenceMarker ||
    String(match.description ?? '').includes(evidenceMarker)
  )
    return { ok: true, action: 'unchanged', ...identity };
  const listed = await listComments({
    issueId: match.id,
    apiKey,
    fetchImpl,
  });
  if (!listed.ok) return listed;
  if (listed.comments.some(comment => comment.body.includes(evidenceMarker)))
    return { ok: true, action: 'unchanged', ...identity };
  const posted = await addComment({
    issueId: match.id,
    body: descriptionBody,
    apiKey,
    fetchImpl,
  });
  if (!posted.ok) return posted;
  return { ok: true, action: 'commented', ...identity };
}
