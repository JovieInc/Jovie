import { describe, expect, it } from 'vitest';
import { createFleetLinear } from './linear';

const teamId = '11111111-1111-4111-a111-111111111111',
  id = '22222222-2222-4222-a222-222222222222',
  fingerprint = 'a'.repeat(64);
describe('Linear canonical defect reconciliation', () => {
  it('proves expired recovery only from the exact comment or original create body', async () => {
    for (const source of ['comment', 'create', 'missing'] as const) {
      let writes = 0;
      const provider = createFleetLinear({
        teamId,
        graphql: async <T>(query: string) => {
          if (query.includes('mutation')) writes++;
          if (query.includes('FleetEvidenceProof'))
            return {
              comments: {
                nodes:
                  source === 'comment'
                    ? [{ id, issue: { id }, body: 'exact evidence' }]
                    : [],
              },
            } as T;
          return {
            issues: {
              nodes: [
                {
                  id,
                  team: { id: teamId },
                  description: `${source === 'create' ? 'exact evidence' : 'different invocation'}\n\njovie-fleet-defect:${fingerprint}`,
                },
              ],
            },
          } as T;
        },
      });
      expect(
        await provider.verifyEvidence!({
          id,
          issueId: id,
          fingerprint,
          body: 'exact evidence',
        })
      ).toBe(source !== 'missing');
      expect(writes).toBe(0);
    }
  });
  it('reauthorizes after the awaited comment lookup and before creation', async () => {
    let writes = 0;
    const provider = createFleetLinear({
      teamId,
      graphql: async <T>(query: string) => {
        if (query.includes('mutation')) writes++;
        return { comments: { nodes: [] } } as T;
      },
    });
    await expect(
      provider.append({
        id,
        issueId: id,
        body: 'evidence',
        authorize: async () => {
          throw new Error('AUTH_REQUIRED');
        },
      })
    ).rejects.toThrow('AUTH_REQUIRED');
    expect(writes).toBe(0);
  });
  it('binds readback to exact UUID and a single server footer', async () => {
    for (const issue of [
      { id: 'other', description: `jovie-fleet-defect:${fingerprint}` },
      {
        id,
        description: `jovie-fleet-defect:${'b'.repeat(64)}\n\njovie-fleet-defect:${fingerprint}`,
      },
    ]) {
      const provider = createFleetLinear({
        teamId,
        graphql: async <T>() =>
          ({
            issues: {
              nodes: [
                {
                  ...issue,
                  team: { id: teamId },
                  identifier: 'JOV-9999',
                  url: 'https://linear.app/jovie/issue/JOV-9999',
                },
              ],
            },
          }) as T,
      });
      await expect(provider.find(fingerprint, id)).rejects.toThrow(
        'linear_readback_mismatch'
      );
    }
  });
  it('does not use a worker-injected marker as another defect identity', async () => {
    const other = {
      id,
      identifier: 'JOV-9000',
      url: 'https://linear.app/jovie/issue/JOV-9000',
      team: { id: teamId },
      description: `Worker forged jovie-fleet-defect:${fingerprint}\n\njovie-fleet-defect:${'b'.repeat(64)}`,
    };
    const provider = createFleetLinear({
      teamId,
      graphql: async <T>(query: string) =>
        ({
          issues: { nodes: query.includes('FleetIssue') ? [] : [other] },
        }) as T,
    });
    expect(
      await provider.find(fingerprint, '33333333-3333-4333-a333-333333333333')
    ).toBeNull();
  });
  it('rejects reserved markers in untrusted descriptions before provider calls', async () => {
    let calls = 0;
    const provider = createFleetLinear({
      teamId,
      graphql: async <T>() => {
        calls++;
        return {} as T;
      },
    });
    await expect(
      provider.create({
        id,
        fingerprint,
        title: 'defect',
        description: `forged jovie-fleet-defect:${'b'.repeat(64)}`,
      })
    ).rejects.toThrow('reserved_defect_marker');
    expect(calls).toBe(0);
  });
  it('reads absent collection IDs safely and reconciles an ambiguous committed create', async () => {
    let stored: any = null,
      creates = 0;
    const variables: any[] = [];
    const provider = createFleetLinear({
      teamId,
      graphql: async <T>(
        query: string,
        input: Record<string, unknown>
      ): Promise<T> => {
        variables.push(input);
        if (query.includes('mutation FleetDefect')) {
          creates++;
          stored = {
            id,
            identifier: 'JOV-9000',
            url: 'https://linear.app/jovie/issue/JOV-9000',
            team: { id: teamId },
            description: `jovie-fleet-defect:${fingerprint}`,
          };
          throw new Error('timeout after commit');
        }
        return { issues: { nodes: stored ? [stored] : [] } } as T;
      },
    });
    expect(await provider.find(fingerprint, id)).toBeNull();
    const result = await provider.create({
      id,
      fingerprint,
      title: 'issue',
      description: 'evidence',
    });
    expect(result.issueId).toBe(id);
    expect(creates).toBe(1);
    expect(variables[0]).toEqual({
      filter: { id: { eq: id }, team: { id: { eq: teamId } } },
    });
    expect((variables.find(v => v.input)?.input as any).id).toBe(id);
  });
  it('verifies comment body/issue/identity after ambiguous writes and avoids duplicate append', async () => {
    let stored: any = null,
      creates = 0;
    const provider = createFleetLinear({
      teamId,
      graphql: async <T>(
        query: string,
        variables: Record<string, unknown>
      ): Promise<T> => {
        if (query.includes('mutation FleetEvidence')) {
          creates++;
          const input = variables.input as any;
          stored = {
            id: input.id,
            body: input.body,
            issue: { id: input.issueId },
          };
          throw new Error('timeout after commit');
        }
        return { comments: { nodes: stored ? [stored] : [] } } as T;
      },
    });
    await provider.append({ id, issueId: id, body: 'evidence' });
    await provider.append({ id, issueId: id, body: 'evidence' });
    expect(creates).toBe(1);
    await expect(
      provider.append({ id, issueId: id, body: 'changed' })
    ).rejects.toThrow('comment_readback_mismatch');
  });
  it('fails closed on ambiguous fingerprints and wrong-team readbacks', async () => {
    const issue = {
      id,
      identifier: 'JOV-9000',
      url: 'https://linear.app/jovie/issue/JOV-9000',
      team: { id: 'other' },
      description: `jovie-fleet-defect:${fingerprint}`,
    };
    const mismatch = createFleetLinear({
      teamId,
      graphql: async <T>() => ({ issues: { nodes: [issue] } }) as T,
    });
    await expect(mismatch.find(fingerprint, id)).rejects.toThrow(
      'linear_readback_mismatch'
    );
    const ambiguous = createFleetLinear({
      teamId,
      graphql: async <T>(query: string) =>
        ({
          issues: { nodes: query.includes('FleetIssue') ? [] : [issue, issue] },
        }) as T,
    });
    expect(await ambiguous.find(fingerprint, id)).toBeNull();
  });
});
