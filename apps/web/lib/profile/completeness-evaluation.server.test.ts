import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const { load, reassess, prepare, evaluate } = vi.hoisted(() => ({
  load: vi.fn(),
  reassess: vi.fn(),
  prepare: vi.fn(),
  evaluate: vi.fn(),
}));
vi.mock('./completeness.server', () => ({
  loadProfileCompleteness: load,
  reassessProfileCompleteness: reassess,
}));
vi.mock('@/lib/jev/profile-completeness.server', () => ({
  prepareProfileCompletenessRequest: prepare,
  runProfileCompletenessEvaluation: evaluate,
}));

import {
  prepareStoredProfileCompletenessEvaluation,
  runStoredProfileCompletenessEvaluation,
} from './completeness-evaluation.server';

const current = {
  profileId: 'profile-1',
  canonicalJson: '{"profileId":"profile-1"}',
  snapshotSha256: 'current-hash',
  policyVersion: 'profile-completeness/v1',
  checks: {
    identity: true,
    photo: true,
    content: true,
    destinations: true,
    provenance: true,
  },
};
describe('stored profile to shared Jev boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    load.mockResolvedValue(new Map([['profile-1', current]]));
    prepare.mockImplementation(input => ({
      fingerprint: input.snapshotSha256,
    }));
    reassess.mockImplementation(async (_id, callback) => callback(current));
    evaluate.mockResolvedValue({ transportStatus: 'not_evaluated' });
  });
  it('prepares exact current public evidence without invoking transport', async () => {
    expect(
      await prepareStoredProfileCompletenessEvaluation(
        'profile-1',
        'source-sha'
      )
    ).toEqual({ fingerprint: 'current-hash' });
    expect(prepare).toHaveBeenCalledWith({
      sourceSha: 'source-sha',
      profileId: 'profile-1',
      snapshotJson: current.canonicalJson,
      snapshotSha256: 'current-hash',
      policyVersion: 'profile-completeness/v1',
      checks: current.checks,
    });
    expect(evaluate).not.toHaveBeenCalled();
  });
  it('does not fabricate admission and rereads the DB for the transport freshness check', async () => {
    await runStoredProfileCompletenessEvaluation('profile-1', 'source-sha', {});
    const options = evaluate.mock.calls[0]![1];
    expect(options).not.toHaveProperty('approval');
    expect(options).not.toHaveProperty('apiKey');
    load.mockResolvedValue(
      new Map([['profile-1', { ...current, snapshotSha256: 'changed-hash' }]])
    );
    expect(await options.readCurrentFingerprint()).toBe('changed-hash');
    load.mockResolvedValue(new Map());
    expect(await options.readCurrentFingerprint()).toBe('');
  });
  it('does not prepare a missing profile', async () => {
    load.mockResolvedValue(new Map());
    expect(
      await prepareStoredProfileCompletenessEvaluation('missing', 'source-sha')
    ).toBeNull();
    expect(prepare).not.toHaveBeenCalled();
  });
});
