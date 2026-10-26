import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveMonorepoRoot } from '@/lib/filesystem-paths';
import { compilePlaybookToSkill } from '@/lib/playbooks/compile';
import { validatePlaybookSource } from '@/lib/playbooks/schema';
import {
  growthPreparationFingerprint,
  type LaunchGrowthPreparation,
  selectGrowthPreparation,
} from './growth-preparation';
import { InMemoryLaunchRegistry, type LaunchSourceKind } from './index';

const raw = readFileSync(
  join(
    resolveMonorepoRoot(),
    'docs/playbooks/growth-presence-repair-offer.playbook.md'
  ),
  'utf8'
);
function compiledDraft() {
  const validated = validatePlaybookSource(raw);
  if (!validated.ok) throw new Error(JSON.stringify(validated.errors));
  const compiled = compilePlaybookToSkill(validated.definition, {
    source: raw,
  });
  if (!compiled.ok) throw new Error(JSON.stringify(compiled.errors));
  return compiled.skill;
}
const owner = {
  tenantId: 'fixture-tenant',
  representedIdentityId: 'fixture-artist',
};
function plan(): LaunchGrowthPreparation {
  return {
    version: 'launch-growth-preparation/v1',
    ...owner,
    sourceRevision: 'fixture-source-v1',
    productBuild: 'fixture-build-v1',
    offerVersion: 'fixture-offer-v1',
    destinationRef: 'private-preview:fixture',
    hypothesis: 'A precise, controllable destination repair is useful.',
    scope: 'Synthetic fixture only; no prospect or delivery commissioned.',
    budgetUsd: null,
    capacity: null,
    authority: 'private_preparation_only',
    observationWindow: '14d after separate authorization; not started',
    outcome: 'unobserved',
    selected: [
      selectGrowthPreparation(
        compiledDraft(),
        'Supplied identity and broken destination match this repair job.'
      ),
    ],
  };
}
async function existingLaunch(kind: LaunchSourceKind = 'jovie_capability') {
  const registry = new InMemoryLaunchRegistry();
  const launch = await registry.commission({
    source: { kind, entityId: 'fixture-entity', revision: 'fixture-source-v1' },
    audience: 'internal',
    job: 'prepare a useful destination repair',
    decision: {
      kind: 'no_action',
      reason: 'preparation only',
      decidedAt: '2026-10-15T00:00:00Z',
    },
    availability: { publiclyAvailable: false, userAccessVerified: false },
    destination: {
      kind: 'release_page',
      canonicalRef: 'private-preview:fixture',
    },
  });
  return { registry, launch };
}

describe('playbook evidence on the existing launch read model', () => {
  it.each<LaunchSourceKind>(['jovie_capability', 'artist_release'])(
    'attaches to an existing %s without new launch, receipt or outcome claims',
    async kind => {
      const { registry, launch } = await existingLaunch(kind);
      const prepared = await registry.attachGrowthPreparation(
        launch.launchId,
        plan(),
        owner
      );
      expect(prepared.launchId).toBe(launch.launchId);
      expect(prepared.growthPreparation?.selected[0]).toMatchObject({
        id: 'growth-presence-repair-offer',
        version: '0.1.0',
        governance: {
          allowedChannels: ['private_preview'],
          evaluationStatus: 'not_independently_evaluated',
        },
      });
      expect(prepared.growthPreparation?.outcome).toBe('unobserved');
      expect(prepared.receipts).toEqual([]);
      expect(prepared.outcomes).toEqual([]);
      expect(prepared.decision).toEqual(launch.decision);
      expect(
        await registry.attachGrowthPreparation(launch.launchId, plan(), owner)
      ).toBe(prepared);
      expect(await registry.commission({ ...launch })).toBe(prepared);
    }
  );

  it.each([
    ['tenant', { tenantId: 'other-tenant' }],
    ['represented identity', { representedIdentityId: 'other-artist' }],
    ['source revision', { sourceRevision: 'stale' }],
    ['destination', { destinationRef: 'public:other' }],
    ['missing cost state', { budgetUsd: undefined }],
    ['publication authority', { authority: 'publish_now' }],
    ['unobserved efficacy', { outcome: 'converted' }],
  ])('fails closed on %s mismatch', async (_name, override) => {
    const { registry, launch } = await existingLaunch();
    await expect(
      registry.attachGrowthPreparation(
        launch.launchId,
        { ...plan(), ...override } as LaunchGrowthPreparation,
        owner
      )
    ).rejects.toThrow();
    expect(
      (await registry.get(launch.launchId))?.growthPreparation
    ).toBeUndefined();
  });

  it('rejects changed selections and payloads rather than silently inheriting the old attachment', async () => {
    const { registry, launch } = await existingLaunch();
    const initial = plan();
    await registry.attachGrowthPreparation(launch.launchId, initial, owner);
    for (const changed of [
      { ...initial, productBuild: 'v2' },
      { ...initial, offerVersion: 'v2' },
      { ...initial, selected: [{ ...initial.selected[0], version: '0.2.0' }] },
    ]) {
      expect(growthPreparationFingerprint(changed)).not.toBe(
        growthPreparationFingerprint(initial)
      );
      await expect(
        registry.attachGrowthPreparation(launch.launchId, changed, owner)
      ).rejects.toThrow('changed');
    }
  });

  it('does not attach to unknown, withdrawn or retracted launches', async () => {
    const { registry, launch } = await existingLaunch();
    await expect(
      registry.attachGrowthPreparation('unknown', plan(), owner)
    ).rejects.toThrow('unknown launch');
    for (const state of ['withdrawn', 'retracted'] as const) {
      await registry.annotate(launch.launchId, state, 'fixture unavailable');
      await expect(
        registry.attachGrowthPreparation(launch.launchId, plan(), owner)
      ).rejects.toThrow('inactive');
    }
  });

  it('does not treat a released, unbound or malformed skill as a preparation selection', () => {
    const draft = compiledDraft();
    expect(() =>
      selectGrowthPreparation({ ...draft, lifecycle: 'ga' }, 'fit')
    ).toThrow('compiled draft');
    expect(() =>
      selectGrowthPreparation({ ...draft, metadata: {} }, 'fit')
    ).toThrow();
    expect(() =>
      selectGrowthPreparation(
        {
          ...draft,
          metadata: { ...draft.metadata, growthGovernance: 'invalid' },
        },
        'fit'
      )
    ).toThrow();
    expect(() =>
      selectGrowthPreparation(
        { ...draft, metadata: { ...draft.metadata, playbookSourceSha256: '' } },
        'fit'
      )
    ).toThrow();
  });
});
