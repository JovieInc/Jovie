import { describe, expect, it, vi } from 'vitest';
import { bindEveIdentityForTurn } from '@/lib/ovie/identity';
import {
  coordinateLinearWork,
  LINEAR_COORDINATION_SCHEMA,
  type LinearCoordinationDeps,
} from '@/lib/ovie/linear-coordination';

function depsWith(
  overrides: Partial<LinearCoordinationDeps> = {}
): LinearCoordinationDeps {
  const snapshot = {
    id: 'issue_1',
    identifier: 'JOV-9001',
    title: 'Bounded recovery follow-up',
    url: 'https://linear.app/jovie/issue/JOV-9001',
  };
  return {
    createIssue: vi.fn(async () => snapshot),
    updateIssue: vi.fn(async () => snapshot),
    readIssue: vi.fn(async () => snapshot),
    now: () => '2026-09-12T16:30:00.000Z',
    ...overrides,
  };
}

describe('Summer bounded Linear coordination', () => {
  it('creates an issue and returns a readback receipt (not execution/delivery)', async () => {
    const deps = depsWith();
    const result = await coordinateLinearWork(
      {
        action: 'create',
        title: 'Bounded recovery follow-up',
        body: 'Track remaining human decision after Cursor recovery.',
        teamId: 'team_1',
        founderIntentRef: 'intent:founder:recovery-followup',
        sourceRefs: ['receipt:cursor-recovery#run_1'],
        author: 'summer',
      },
      deps
    );
    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.receipt.schema).toBe(LINEAR_COORDINATION_SCHEMA);
      expect(result.receipt.identifier).toBe('JOV-9001');
      expect(result.receipt.executionCompleted).toBe(false);
      expect(result.receipt.deliveryAccepted).toBe(false);
      expect(result.receipt.readBackAt).toBe('2026-09-12T16:30:00.000Z');
    }
    expect(deps.createIssue).toHaveBeenCalledOnce();
    expect(deps.readIssue).toHaveBeenCalledWith('issue_1');
  });

  it('updates an issue with readback', async () => {
    const deps = depsWith();
    const result = await coordinateLinearWork(
      {
        action: 'update',
        title: 'Bounded recovery follow-up',
        body: 'Updated remaining human decision.',
        teamId: 'team_1',
        issueId: 'issue_1',
        founderIntentRef: 'intent:founder:recovery-followup',
        sourceRefs: ['receipt:cursor-recovery#run_1'],
        author: 'summer',
      },
      deps
    );
    expect(result.status).toBe('ok');
    expect(deps.updateIssue).toHaveBeenCalledOnce();
  });

  it('denies mutations without founder intent or provenance', async () => {
    const deniedIntent = await coordinateLinearWork(
      {
        action: 'create',
        title: 'x',
        body: 'y',
        teamId: 'team_1',
        founderIntentRef: '',
        sourceRefs: ['s'],
        author: 'summer',
      },
      depsWith()
    );
    expect(deniedIntent).toMatchObject({
      status: 'denied',
      code: 'missing-founder-intent',
    });

    const deniedProvenance = await coordinateLinearWork(
      {
        action: 'create',
        title: 'x',
        body: 'y',
        teamId: 'team_1',
        founderIntentRef: 'intent:x',
        sourceRefs: [],
        author: 'summer',
      },
      depsWith()
    );
    expect(deniedProvenance).toMatchObject({
      status: 'denied',
      code: 'missing-provenance',
    });
  });

  it('fails closed when readback is missing or mismatched', async () => {
    const missing = await coordinateLinearWork(
      {
        action: 'create',
        title: 'x',
        body: 'y',
        teamId: 'team_1',
        founderIntentRef: 'intent:x',
        sourceRefs: ['s'],
        author: 'summer',
      },
      depsWith({ readIssue: async () => null })
    );
    expect(missing).toMatchObject({
      status: 'failed',
      code: 'readback-missing',
    });

    const mismatch = await coordinateLinearWork(
      {
        action: 'create',
        title: 'x',
        body: 'y',
        teamId: 'team_1',
        founderIntentRef: 'intent:x',
        sourceRefs: ['s'],
        author: 'summer',
      },
      depsWith({
        readIssue: async () => ({
          id: 'other',
          identifier: 'JOV-0',
          title: 'x',
          url: 'https://linear.app/jovie/issue/JOV-0',
        }),
      })
    );
    expect(mismatch).toMatchObject({
      status: 'denied',
      code: 'readback-mismatch',
    });
  });

  it('grants linear-coordination-write to Summer and denies it to Jovie', () => {
    const summer = bindEveIdentityForTurn('summer');
    expect(() => summer.require('linear-coordination-write')).not.toThrow();
    expect(() => summer.require('privileged-gbrain-write')).toThrow();

    const jovie = bindEveIdentityForTurn('jovie');
    expect(() => jovie.require('linear-coordination-write')).toThrow();
  });
});
