import { mkdtemp, readFile, realpath, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  buildProfileRedesignProposals,
  PROFILE_REDESIGN_LINEAR_ISSUE_ID,
  PROFILE_REDESIGN_SURFACE_ID,
  runProfileRedesignProposalLoop,
} from '@/lib/agent-os/design-lab/profile-redesign-loop';
import {
  listProfileRedesignTargets,
  PROFILE_REDESIGN_COMPETITOR_TARGETS,
  PROFILE_REDESIGN_OWNED_TARGETS,
} from '@/lib/agent-os/design-lab/profile-targets';
import { listProfileRedesignTreatments } from '@/lib/agent-os/design-lab/profile-treatments';

describe('profile redesign targets', () => {
  it('includes owned profiles and selected competitor handles', () => {
    const all = listProfileRedesignTargets();
    expect(all.some(target => target.kind === 'owned')).toBe(true);
    expect(all.some(target => target.kind === 'competitor')).toBe(true);
    expect(PROFILE_REDESIGN_OWNED_TARGETS.length).toBeGreaterThan(0);
    expect(PROFILE_REDESIGN_COMPETITOR_TARGETS.length).toBeGreaterThan(0);
  });

  it('filters by kind', () => {
    const owned = listProfileRedesignTargets({ kinds: ['owned'] });
    expect(owned.every(target => target.kind === 'owned')).toBe(true);
    expect(owned.length).toBe(PROFILE_REDESIGN_OWNED_TARGETS.length);
  });
});

describe('buildProfileRedesignProposals', () => {
  it('builds pending proposals gated for D2 review', () => {
    const { proposals, skippedRejectedDirections } =
      buildProfileRedesignProposals({
        dayBucket: '2026-07-31',
        createdAt: '2026-07-31T12:00:00.000Z',
        targets: listProfileRedesignTargets(),
        treatments: listProfileRedesignTreatments(),
      });

    expect(skippedRejectedDirections).toBe(0);
    expect(proposals.length).toBeGreaterThan(0);
    expect(proposals.every(proposal => proposal.status === 'pending')).toBe(
      true
    );
    expect(
      proposals.every(
        proposal => proposal.linearIssueId === PROFILE_REDESIGN_LINEAR_ISSUE_ID
      )
    ).toBe(true);
    expect(
      proposals.every(
        proposal => proposal.surfaceId === PROFILE_REDESIGN_SURFACE_ID
      )
    ).toBe(true);
    expect(
      proposals.every(proposal => proposal.proposalText.includes('D2 approval'))
    ).toBe(true);
    expect(proposals.every(proposal => proposal.reviewDecision === null)).toBe(
      true
    );
    expect(proposals.every(proposal => proposal.dispatchId === null)).toBe(
      true
    );
  });

  it('covers owned and competitor targets in proposal text', () => {
    const { proposals } = buildProfileRedesignProposals({
      dayBucket: '2026-07-31',
      createdAt: '2026-07-31T12:00:00.000Z',
      targets: listProfileRedesignTargets(),
      treatments: listProfileRedesignTreatments().slice(0, 1),
    });

    const joined = proposals.map(proposal => proposal.proposalText).join('\n');
    expect(joined).toContain('Owned profile');
    expect(joined).toContain('Competitor handle (reference)');
  });

  it('skips directions already rejected in taste memory', () => {
    const treatment = listProfileRedesignTreatments()[0];
    expect(treatment).toBeDefined();

    const tasteMemory = [
      '## 2026-07-01T00:00:00.000Z — profile-page — rejected',
      'Surface: Public profile page',
      `Direction: ${treatment?.proposalBody ?? ''}`,
      'Decision: rejected',
      'Linear: JOV-1951',
      'Reviewer: tester',
      'Notes: —',
      '',
    ].join('\n');

    const { proposals, skippedRejectedDirections } =
      buildProfileRedesignProposals({
        dayBucket: '2026-07-31',
        createdAt: '2026-07-31T12:00:00.000Z',
        targets: listProfileRedesignTargets({ kinds: ['owned'] }).slice(0, 1),
        treatments: [treatment!],
        tasteMemoryExcerpt: tasteMemory,
      });

    expect(skippedRejectedDirections).toBe(1);
    expect(proposals).toHaveLength(0);
  });

  it('respects maxProposals ranking', () => {
    const { proposals } = buildProfileRedesignProposals({
      dayBucket: '2026-07-31',
      createdAt: '2026-07-31T12:00:00.000Z',
      targets: listProfileRedesignTargets(),
      treatments: listProfileRedesignTreatments(),
      maxProposals: 2,
    });

    expect(proposals).toHaveLength(2);
    const scores = proposals.map(proposal => proposal.scoring?.score ?? 0);
    expect(scores[0]! >= scores[1]!).toBe(true);
  });
});

describe('runProfileRedesignProposalLoop', () => {
  let tempRoot = '';

  beforeEach(async () => {
    tempRoot = await realpath(
      await mkdtemp(path.join(os.tmpdir(), 'profile-redesign-loop-'))
    );
  });

  afterEach(async () => {
    await rm(tempRoot, { recursive: true, force: true });
  });

  it('persists pending proposals and mockup placeholders without approving', async () => {
    const result = await runProfileRedesignProposalLoop({
      dayBucket: '2026-07-31',
      createdAt: '2026-07-31T15:00:00.000Z',
      kinds: ['owned'],
      maxProposals: 1,
      tasteMemoryExcerpt: '',
      rootDirectory: tempRoot,
    });

    expect(result.dryRun).toBe(false);
    expect(result.proposals).toHaveLength(1);
    expect(result.proposals[0]?.status).toBe('pending');
    expect(result.writtenPaths.length).toBe(2);

    const proposalPath = result.writtenPaths[0]!;
    const raw = await readFile(proposalPath, 'utf8');
    const parsed = JSON.parse(raw) as {
      status: string;
      reviewDecision: string | null;
      dispatchId: string | null;
    };

    expect(parsed.status).toBe('pending');
    expect(parsed.reviewDecision).toBeNull();
    expect(parsed.dispatchId).toBeNull();
  });

  it('supports dry-run without writing files', async () => {
    const result = await runProfileRedesignProposalLoop({
      dayBucket: '2026-07-31',
      createdAt: '2026-07-31T15:00:00.000Z',
      dryRun: true,
      maxProposals: 3,
      tasteMemoryExcerpt: '',
      rootDirectory: tempRoot,
    });

    expect(result.dryRun).toBe(true);
    expect(result.proposals.length).toBe(3);
    expect(result.writtenPaths).toEqual([]);
  });
});
