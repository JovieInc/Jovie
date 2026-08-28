import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import * as admissionGate from '../admission-gate.mjs';
import * as deterministicGates from '../deterministic-gates.mjs';
import {
  ADMISSION_TARGET_FIELDS,
  admissionTargetsCollide,
  authoritativeBehaviorOwners,
  loadOwnershipInventory,
  resolveAdmissionTarget,
} from '../ownership-inventory.mjs';
import * as planGate from '../plan-gate.mjs';
import { planEvidenceFor, withPreLeaseReceipts } from './pre-lease.mjs';

const NOW = '2026-08-22T12:00:00.000Z';

function issue(overrides = {}) {
  return {
    id: 'issue-id',
    identifier: 'JOV-5278',
    title: 'Bound a Jovie admission adapter',
    description: `## Proposed fix
Keep repository-aware admission in scripts/backlog-orchestrator/admission-gate.mjs.

## Optimization exception
- Class: non-product
- Justification: This control-plane ownership adapter ships no user-facing page, link, asset, campaign, recommendation, or content variant.

## Acceptance criteria
* New packets name target fields.`,
    createdAt: '2026-08-01T00:00:00.000Z',
    priority: 2,
    estimate: 2,
    state: { name: 'Todo' },
    assignee: null,
    labels: { nodes: [] },
    children: { nodes: [] },
    comments: { nodes: [] },
    ...overrides,
  };
}

function summerOnlyIssue() {
  return issue({
    identifier: 'JOV-5300',
    title: 'Update Summer bottleneck policy',
    description: `## Proposed fix
Change the Summer runtime manifest in JovieInc/summer-config. No Jovie product files change.

## Acceptance criteria
* Summer policy updates without a Jovie PR.`,
  });
}

describe('JOV-5278 ownership inventory', () => {
  it('loads one owner each for Summer, company-state, and shipping', () => {
    const inventory = loadOwnershipInventory();
    assert.equal(inventory.schema, 'jovie-ownership-inventory/v1');
    const owners = authoritativeBehaviorOwners(inventory);
    assert.equal(owners['summer-runtime-policy'].owner, 'Summer');
    assert.equal(
      owners['summer-runtime-policy'].intended_repo,
      'JovieInc/summer-config'
    );
    assert.equal(owners['company-canon'].intended_repo, 'JovieInc/Ops');
    assert.equal(owners['runtime-ledger'].owner, 'runtime ledger');
    assert.equal(
      owners['cross-repo-shipping'].owner,
      'existing Symphony/factory authority'
    );
    const ids = inventory.systems.map(system => system.id);
    assert.equal(ids.length, new Set(ids).size);
  });

  it('names the four target fields and admits Jovie adapter work', () => {
    const targeting = resolveAdmissionTarget(issue());
    assert.equal(targeting.decision, 'admit');
    for (const field of ADMISSION_TARGET_FIELDS) {
      assert.ok(targeting.target[field]);
    }
    assert.equal(targeting.target.target_repo, 'JovieInc/Jovie');
    assert.equal(
      targeting.target.artifact,
      'scripts/backlog-orchestrator/admission-gate.mjs'
    );
    const adapter = resolveAdmissionTarget(
      issue({
        identifier: 'JOV-5301',
        description: `## Proposed fix
Harden apps/web/lib/ovie/summer-transport.ts as a thin adapter.

## Acceptance criteria
* Jovie does not keep Summer alive.`,
      })
    );
    assert.equal(adapter.decision, 'admit');
    assert.equal(
      adapter.target.artifact,
      'apps/web/lib/ovie/summer-transport.ts'
    );
    const named = resolveAdmissionTarget(
      issue({
        description: `## Target
- target_system: jovie-product
- target_repo: JovieInc/Jovie
- artifact: scripts/backlog-orchestrator/ownership-inventory.json
- verification_authority: JovieInc/Jovie CI

## Proposed fix
Write the inventory later slices consume.

## Acceptance criteria
* Later slices consume this inventory.`,
      })
    );
    assert.equal(
      named.target.artifact,
      'scripts/backlog-orchestrator/ownership-inventory.json'
    );
  });

  it('rejects or reroutes a Jovie packet with no Jovie artifact', async () => {
    const targeting = resolveAdmissionTarget(summerOnlyIssue());
    assert.equal(targeting.decision, 'reroute');
    assert.equal(targeting.reason, 'no-jovie-artifact');
    assert.equal(targeting.reroute.target_repo, 'JovieInc/summer-config');
    assert.equal(
      deterministicGates.validateDeterministicPlanCandidate(summerOnlyIssue()),
      'no-jovie-artifact'
    );
    const planned = deterministicGates.buildDeterministicPlanEvidence(
      summerOnlyIssue()
    );
    assert.equal(planned.evidence, null);
    const ready = withPreLeaseReceipts(summerOnlyIssue(), { now: NOW });
    const result = await admissionGate.approveAdmission({
      issue: {
        ...ready,
        comments: {
          nodes: [
            ...ready.comments.nodes,
            {
              body: planGate.buildPlanGateReceipt(ready, planEvidenceFor(), {
                now: NOW,
              }),
            },
          ],
        },
      },
      client: {
        addComment() {
          throw new Error('must-not-mutate');
        },
      },
      now: NOW,
    });
    assert.equal(result.status, 'rejected');
    assert.equal(result.reason, 'no-jovie-artifact');
  });

  it('writes target fields onto a new admission receipt', () => {
    const candidate = withPreLeaseReceipts(issue(), { now: NOW });
    const { evidence } =
      deterministicGates.buildDeterministicPlanEvidence(candidate);
    const ready = {
      ...candidate,
      comments: {
        nodes: [
          ...candidate.comments.nodes,
          {
            body: planGate.buildPlanGateReceipt(candidate, evidence, {
              now: NOW,
            }),
          },
        ],
      },
    };
    const payload = JSON.parse(
      admissionGate
        .buildAdmissionGateReceipt(ready, { now: NOW })
        .split('\n')[1]
    );
    for (const field of ADMISSION_TARGET_FIELDS) {
      assert.equal(payload[field], evidence.target[field]);
    }
  });

  it('rejects a lease collision while allowing unrelated product concurrency', () => {
    const jovieWeb = resolveAdmissionTarget(
      issue({
        description: `## Proposed fix
Change apps/web/lib/ovie/summer-kanban.ts.

## Acceptance criteria
* Focused test passes.`,
      })
    ).target;
    const jovieWebPeer = resolveAdmissionTarget(
      issue({
        identifier: 'JOV-5307',
        description: `## Proposed fix
Change apps/web/lib/ovie/summer-transport.ts.

## Acceptance criteria
* Focused test passes.`,
      })
    ).target;
    const logYourBody = resolveAdmissionTarget(
      issue({
        identifier: 'LYB-900',
        team: { key: 'LYB' },
        description: `## Proposed fix
Change JovieInc/LogYourBody.

## Acceptance criteria
* Focused test passes.`,
      })
    ).target;

    assert.equal(admissionTargetsCollide(jovieWeb, jovieWebPeer), true);
    assert.equal(admissionTargetsCollide(jovieWeb, logYourBody), false);
    assert.ok(jovieWeb.collision_domains.length > 0);
  });

  it('keeps LYB packets on LogYourBody', () => {
    const targeting = resolveAdmissionTarget(
      issue({
        identifier: 'LYB-12',
        project: null,
        description: `## Proposed fix
Fix the gesture.

## Acceptance criteria
* Positions map linearly.`,
      })
    );
    assert.equal(targeting.target.target_repo, 'JovieInc/LogYourBody');
  });
});
