import type { FleetLinear, Issue } from './dispatcher';

type IssueWire = {
  id: string;
  identifier: string;
  url: string;
  description?: string | null;
  team?: { id: string };
  state?: { type: string };
  assignee?: { name: string } | null;
  attachments?: { nodes: { url: string }[] };
};
export interface FleetLinearOptions {
  teamId: string;
  graphql: <T>(query: string, variables: Record<string, unknown>) => Promise<T>;
}
const FIELDS = 'id identifier url description team { id }';
function marker(fingerprint: string) {
  return `jovie-fleet-defect:${fingerprint}`;
}
export function createFleetLinear(
  options: FleetLinearOptions
): FleetLinear & { validateMission: (input: unknown) => Promise<boolean> } {
  const { graphql, teamId } = options;
  // Collection filters return an empty set for a missing deterministic ID.
  // The singular issue/comment queries can throw NOT_FOUND before creation.
  async function read(id: string) {
    return (
      (
        await graphql<{ issues: { nodes: IssueWire[] } }>(
          `query FleetIssue($filter:IssueFilter!){issues(first:1,filter:$filter){nodes{${FIELDS}}}}`,
          { filter: { id: { eq: id }, team: { id: { eq: teamId } } } }
        )
      ).issues.nodes[0] ?? null
    );
  }
  function verified(issue: IssueWire, fingerprint: string, id: string): Issue {
    if (
      issue.id !== id ||
      issue.team?.id !== teamId ||
      issue.description?.trim().split('\n').at(-1) !== marker(fingerprint) ||
      (issue.description?.match(/jovie-fleet-defect:/gi)?.length ?? 0) !== 1
    )
      throw new Error('linear_readback_mismatch');
    return {
      issueId: issue.id,
      identifier: issue.identifier,
      url: issue.url,
      fingerprint,
    };
  }
  return {
    async verifyEvidence(input) {
      const data = await graphql<{
        comments: {
          nodes: { id: string; body: string; issue: { id: string } }[];
        };
      }>(
        'query FleetEvidenceProof($filter:CommentFilter!){comments(first:1,filter:$filter){nodes{id body issue{id}}}}',
        {
          filter: {
            id: { eq: input.id },
            issue: { id: { eq: input.issueId } },
          },
        }
      );
      const comment = data.comments.nodes[0];
      if (
        comment?.id === input.id &&
        comment.issue.id === input.issueId &&
        comment.body === input.body
      )
        return true;
      const issue = await read(input.issueId);
      return (
        issue?.id === input.issueId &&
        issue.team?.id === teamId &&
        issue.description === `${input.body}\n\n${marker(input.fingerprint)}`
      );
    },
    async find(fingerprint, id) {
      const existing = await read(id);
      // Only the server-derived UUID establishes identity. Editable issue text
      // cannot redirect canonical deduplication to another issue.
      return existing ? verified(existing, fingerprint, id) : null;
    },
    async create(input) {
      if (/jovie-fleet-defect:/i.test(`${input.title}\n${input.description}`))
        throw new Error('reserved_defect_marker');
      await input.authorize?.();
      try {
        await graphql(
          `mutation FleetDefect($input:IssueCreateInput!){issueCreate(input:$input){success issue{id}}}`,
          {
            input: {
              id: input.id,
              teamId,
              title: input.title,
              description: `${input.description}\n\n${marker(input.fingerprint)}`,
            },
          }
        );
      } catch (error) {
        // Duplicate ID or ambiguous timeout: prove persisted identity before
        // reporting success. Never fall back to a random create ID.
        const found = await read(input.id);
        if (found) return verified(found, input.fingerprint, input.id);
        throw error;
      }
      const found = await read(input.id);
      if (!found) throw new Error('linear_readback_missing');
      return verified(found, input.fingerprint, input.id);
    },
    async append(input) {
      async function readComment() {
        return (
          (
            await graphql<{
              comments: {
                nodes: { id: string; body: string; issue: { id: string } }[];
              };
            }>(
              'query FleetComment($filter:CommentFilter!){comments(first:1,filter:$filter){nodes{id body issue{id}}}}',
              {
                filter: {
                  id: { eq: input.id },
                  issue: { id: { eq: input.issueId } },
                },
              }
            )
          ).comments.nodes[0] ?? null
        );
      }
      function check(comment: Awaited<ReturnType<typeof readComment>>) {
        if (
          !comment ||
          comment.id !== input.id ||
          comment.issue.id !== input.issueId ||
          comment.body !== input.body
        )
          throw new Error('comment_readback_mismatch');
      }
      const prior = await readComment();
      if (prior) {
        check(prior);
        return;
      }
      // The preceding provider read can race credential revocation or fencing.
      await input.authorize?.();
      try {
        await graphql(
          'mutation FleetEvidence($input:CommentCreateInput!){commentCreate(input:$input){success comment{id}}}',
          { input: { id: input.id, issueId: input.issueId, body: input.body } }
        );
      } catch (error) {
        const found = await readComment();
        if (found) {
          check(found);
          return;
        }
        throw error;
      }
      check(await readComment());
    },
    async validateMission(input) {
      if (!input || typeof input !== 'object') return false;
      const m = input as {
        issueId: string;
        owner: string;
        existingWorkRefs: string[];
      };
      const data = await graphql<{ issue: IssueWire | null }>(
        `query FleetAdmission($id:String!){issue(id:$id){${FIELDS} state{type} assignee{name} attachments(first:50){nodes{url}}}}`,
        { id: m.issueId }
      );
      const issue = data.issue;
      return (
        !!issue &&
        issue.team?.id === teamId &&
        !['completed', 'canceled'].includes(issue.state?.type ?? '') &&
        issue.assignee?.name === m.owner &&
        Array.isArray(m.existingWorkRefs) &&
        (issue.attachments?.nodes ?? []).every(a =>
          m.existingWorkRefs.includes(a.url)
        )
      );
    },
  };
}
