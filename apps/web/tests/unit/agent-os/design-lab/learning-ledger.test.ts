import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  appendDesignLearningEntry,
  DesignLearningEntrySchema,
  designLearningContentHash,
} from '@/lib/agent-os/design-lab/learning-ledger';

const digest = `sha256:${'a'.repeat(64)}`;

function stageHistory(stage: string) {
  const common = [
    'captured',
    'classified',
    'corroborated',
    'conflict-checked',
    'proposed',
  ];
  const stages =
    stage === 'rejected'
      ? [...common, 'rejected']
      : stage === 'enforced'
        ? [...common, 'accepted', 'enforced']
        : common.slice(0, Math.max(1, common.indexOf(stage) + 1));
  return stages.map(eventStage => ({
    stage: eventStage,
    at: '2026-08-12T00:00:00.000Z',
    reviewer: eventStage === 'accepted' ? 'founder' : 'codex',
  }));
}

function entry(overrides: Record<string, unknown> = {}) {
  const base = {
    schemaVersion: 1,
    entryId: 'logo-visible-bounds-v1',
    ruleKey: 'logo-visible-bounds',
    stage: 'enforced',
    stageHistory: stageHistory('enforced'),
    authority: 'founder-global',
    scope: ['shared-media', 'marketing', 'artist-profiles', 'press-kits'],
    confidence: 1,
    statement:
      'Normalize logos by visible non-transparent pixels, not file canvas.',
    originalPrompt:
      'This is an explicit global rule: logo bars must normalize by visible pixel bounds.',
    transcriptExcerpt: null,
    transcriptDigest: digest,
    targetRoot: 'shared-media',
    componentIdentity: '@jovie/ui/media/logo-normalization',
    founderOutcome: 'lock',
    evidence: [
      {
        kind: 'prompt',
        ref: 'codex:source-thread:019fee7f-8514-7630-b50d-1bcbe1bd42d4',
        digest,
        capturedAt: '2026-08-12T00:00:00.000Z',
      },
    ],
    evidenceGaps: [],
    independentSurfaceKeys: [],
    conflictCheck: {
      designMdDigest: digest,
      registryDigests: [digest],
      conflicts: [],
    },
    modelReviews: [],
    enforcementRefs: [
      'packages/ui/media/logo-normalization.ts',
      'scripts/logo-asset-normalization.mjs',
    ],
    rollback:
      'Revert the enforcement commit and restore the prior registry version.',
    supersedesEntryId: null,
    capturedAt: '2026-08-12T00:00:00.000Z',
    updatedAt: '2026-08-12T00:00:00.000Z',
  };
  const candidate = { ...base, ...overrides };
  if (!('stageHistory' in overrides) && typeof candidate.stage === 'string') {
    candidate.stageHistory = stageHistory(candidate.stage);
  }
  return {
    ...candidate,
    contentHash:
      typeof overrides.contentHash === 'string'
        ? overrides.contentHash
        : designLearningContentHash(candidate),
  };
}

describe('Design Learning Ledger', () => {
  it('parses every checked-in ledger row strictly', () => {
    const ledgerPath = path.resolve(
      __dirname,
      '../../../../../../docs/design-system/design-learning-ledger.jsonl'
    );
    const rows = readFileSync(ledgerPath, 'utf8')
      .trim()
      .split('\n')
      .map(line => DesignLearningEntrySchema.parse(JSON.parse(line)));
    expect(rows).toHaveLength(1);
    expect(rows[0].ruleKey).toBe('logo-visible-bounds');
  });

  it('allows explicit founder-global rules to reach enforced', () => {
    expect(appendDesignLearningEntry([], entry())).toHaveLength(1);
  });

  it('dedupes retries by stable content hash', () => {
    const first = entry();
    expect(
      appendDesignLearningEntry([first], entry({ entryId: 'retry' }))
    ).toEqual([first]);
  });

  it('blocks single-surface candidates from proposing themselves as canon', () => {
    expect(() =>
      appendDesignLearningEntry(
        [],
        entry({
          stage: 'proposed',
          authority: 'candidate',
          founderOutcome: 'pending',
          enforcementRefs: [],
        })
      )
    ).toThrow(/two independent surfaces/);
  });

  it('preserves rejected examples without activating them', () => {
    const rejected = entry({
      entryId: 'rejected-v1',
      stage: 'rejected',
      authority: 'candidate',
      founderOutcome: 'reject',
      enforcementRefs: [],
    });
    expect(appendDesignLearningEntry([], rejected)).toEqual([rejected]);
  });

  it('requires explicit supersession for an active rule replacement', () => {
    const active = entry();
    expect(() =>
      appendDesignLearningEntry(
        [active],
        entry({
          entryId: 'replacement',
          statement: 'A different rule.',
        })
      )
    ).toThrow(/must supersede/);
  });
});
