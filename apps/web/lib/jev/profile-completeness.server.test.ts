import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  type EvaluationOptions,
  type ProfileCompletenessInput,
  prepareProfileCompletenessRequest,
  runProfileCompletenessEvaluation,
} from './profile-completeness.server';

vi.mock('server-only', () => ({}));

function fixture(): ProfileCompletenessInput {
  const profileId = '00000000-0000-4000-8000-000000000001';
  const snapshotJson = JSON.stringify({
    profileId,
    username: 'synthetic-echo',
    displayName: 'Synthetic Echo',
    avatarUrl: 'https://example.com/echo.jpg',
    bio: 'A synthetic songwriter preparing an acoustic EP.',
    destinations: [{ platform: 'website', url: 'https://example.com/echo' }],
    provenance: [
      {
        kind: 'public_source',
        referenceId: 'fixture',
        url: 'https://example.com/echo',
      },
    ],
  });
  return {
    sourceSha: 'a'.repeat(40),
    profileId,
    snapshotJson,
    snapshotSha256: createHash('sha256').update(snapshotJson).digest('hex'),
    policyVersion: 'profile-completeness/v1',
    checks: {
      identity: true,
      photo: true,
      content: true,
      destinations: true,
      provenance: true,
    },
  };
}

function options(
  input: ProfileCompletenessInput,
  choice = 'supported'
): EvaluationOptions {
  const request = prepareProfileCompletenessRequest(input);
  return {
    approval: {
      fingerprint: request.fingerprint,
      dataApproved: true,
      fundingApproved: true,
      expiresAt: 2000,
      authorityRef: 'synthetic-test-only',
      availableUsd: 1,
      maxUsd: 0.01,
      estimatedUpperBoundUsd: 0.001,
    },
    readCurrentFingerprint: () => request.fingerprint,
    now: () => 1000,
    transport: async supplied => {
      expect(supplied.route.model).toBe('typesafe-ai/jev');
      expect(supplied.route.provider).toBe('vercel-ai-gateway');
      expect(supplied.artifactSha256).toBe(input.snapshotSha256);
      expect(JSON.parse(supplied.state).profileId).toBe(input.profileId);
      return {
        answers: { alignment: { type: 'choice', choice } },
        response: { modelId: 'typesafe-ai/jev' },
      };
    },
  };
}

describe('shared server completeness evaluator', () => {
  it('uses the shared guarded provider and binds its result to the current revision', async () => {
    const input = fixture();
    const result = await runProfileCompletenessEvaluation(
      input,
      options(input)
    );
    expect(result).toMatchObject({
      profileId: input.profileId,
      snapshotSha256: input.snapshotSha256,
      policyVersion: input.policyVersion,
      transportStatus: 'evaluated',
      verdict: 'supported',
      confidence: null,
      model: 'typesafe-ai/jev',
    });
    const next = fixture();
    next.snapshotJson = next.snapshotJson.replace('acoustic EP', 'live album');
    next.snapshotSha256 = createHash('sha256')
      .update(next.snapshotJson)
      .digest('hex');
    expect(prepareProfileCompletenessRequest(next).fingerprint).not.toBe(
      prepareProfileCompletenessRequest(input).fingerprint
    );
  });

  it('preserves error, abstain and changed-revision rejection through the web boundary', async () => {
    const input = fixture();
    const abstain = await runProfileCompletenessEvaluation(
      input,
      options(input, 'insufficient')
    );
    expect(abstain.verdict).toBe('insufficient');
    const error = await runProfileCompletenessEvaluation(input, {
      ...options(input),
      transport: async () => {
        throw new Error('synthetic unavailable');
      },
    });
    expect(error).toMatchObject({
      transportStatus: 'failed',
      verdict: null,
      evaluatedAt: null,
    });
    let reads = 0;
    const stale = await runProfileCompletenessEvaluation(input, {
      ...options(input),
      readCurrentFingerprint: () =>
        ++reads === 1
          ? prepareProfileCompletenessRequest(input).fingerprint
          : 'profile-edited',
    });
    expect(stale).toMatchObject({
      transportStatus: 'not_evaluated',
      verdict: null,
      reasons: ['evaluation_stale'],
    });
  });

  it('never invokes transport for missing required data or absent admission', async () => {
    const input = fixture();
    const transport = vi.fn(options(input).transport);
    input.checks.photo = false;
    const missing = await runProfileCompletenessEvaluation(input, {
      ...options(input),
      transport,
    });
    expect(missing).toMatchObject({
      verdict: null,
      reasons: ['missing_photo'],
    });
    input.checks.photo = true;
    const unapproved = await runProfileCompletenessEvaluation(input, {
      ...options(input),
      approval: undefined,
      transport,
    });
    expect(unapproved).toMatchObject({
      verdict: null,
      reasons: ['evaluation_not_admitted'],
    });
    expect(transport).not.toHaveBeenCalled();
  });
});
