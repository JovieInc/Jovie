import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  getRollbackPlaybook,
  RELEASE_CLASSES,
  ROLLBACK_PLAYBOOKS,
  RollbackPlaybookSchema,
} from '@/lib/deployments/rollback-playbooks';
import { getP0JourneySlo } from '@/lib/observability/p0-journey-slos';

const REPO_ROOT = join(__dirname, '..', '..', '..', '..');

describe('rollback playbook registry (JOV-6060)', () => {
  it('every entry conforms to the schema', () => {
    for (const playbook of ROLLBACK_PLAYBOOKS) {
      const result = RollbackPlaybookSchema.safeParse(playbook);
      expect(
        result.success,
        `${playbook.id}: ${result.success ? '' : JSON.stringify(result.error.issues)}`
      ).toBe(true);
    }
  });

  it('has unique playbook ids and covers every release class in scope', () => {
    const ids = ROLLBACK_PLAYBOOKS.map(p => p.id);
    expect(new Set(ids).size).toBe(ids.length);

    // The audit scope (JOV-6060) requires each critical release class to have a
    // documented strategy — a missing class is a coverage hole.
    const covered = new Set(ROLLBACK_PLAYBOOKS.map(p => p.releaseClass));
    for (const releaseClass of RELEASE_CLASSES) {
      expect(
        covered.has(releaseClass),
        `missing playbook for ${releaseClass}`
      ).toBe(true);
    }
  });

  it('irreversible releases require an explicit migration/recovery gate', () => {
    for (const playbook of ROLLBACK_PLAYBOOKS.filter(p => p.irreversible)) {
      expect(playbook.recoveryGate, playbook.id).toBeDefined();
      expect(playbook.recoveryGate?.gate.length).toBeGreaterThan(10);
      expect(playbook.recoveryGate?.recoveryPath.length).toBeGreaterThan(10);
    }
  });

  it('every playbook exposes a bounded stop with an observable completion signal', () => {
    for (const playbook of ROLLBACK_PLAYBOOKS) {
      expect(playbook.boundedStop.mechanism.length).toBeGreaterThan(10);
      expect(playbook.boundedStop.completionSignal.length).toBeGreaterThan(10);
      expect(playbook.rtoMinutes).toBeGreaterThan(0);
    }
  });

  it('drill journeys reference real P0 journeys so drills verify core user paths', () => {
    for (const playbook of ROLLBACK_PLAYBOOKS) {
      for (const journeyId of playbook.drillJourneys) {
        expect(
          getP0JourneySlo(journeyId),
          `${playbook.id} references unknown journey ${journeyId}`
        ).toBeDefined();
      }
    }
  });

  it('every playbook records recovery evidence into an existing channel', () => {
    for (const playbook of ROLLBACK_PLAYBOOKS) {
      expect(playbook.evidenceChannels.length).toBeGreaterThan(0);
      expect(playbook.proofArtifacts.length).toBeGreaterThan(0);
      expect(existsSync(join(REPO_ROOT, playbook.runbook))).toBe(true);
    }
  });

  it('pre-deploy artifact handling is explicit — nothing silently dropped', () => {
    for (const playbook of ROLLBACK_PLAYBOOKS) {
      const artifacts = playbook.preDeployArtifacts.map(a => a.artifact);
      expect(new Set(artifacts).size).toBe(artifacts.length);
      for (const artifact of playbook.preDeployArtifacts) {
        expect(artifact.mechanism.length).toBeGreaterThan(10);
      }
    }
  });

  it('getRollbackPlaybook looks up by id', () => {
    expect(getRollbackPlaybook('web-deploy')?.releaseClass).toBe('web-deploy');
    expect(getRollbackPlaybook('nope')).toBeUndefined();
  });
});
