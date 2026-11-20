import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  planWriteSwarm,
  validateWriteSwarmReceipt,
  WRITE_SWARM_CONTRACT,
  WRITE_SWARM_SCHEMA,
  WRITE_SWARM_STEPS,
} from './contract.mjs';

const CLI = fileURLToPath(new URL('./cli.mjs', import.meta.url));
const cli = (...args) =>
  spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' });

const liveBase = {
  schema: WRITE_SWARM_SCHEMA,
  mode: 'live',
  inventAndRubberStamp: false,
  lease: {
    schema: 'pen-writer-lease/v1',
    holder: 'write-swarm',
    token: '11111111-1111-1111-1111-111111111111',
    acquired: true,
  },
  mutate: { performed: true, writer: 'write-swarm' },
  system1: {
    source: 'pen-review-panel',
    receiptSchema: 'pen-review-receipt/v1',
    verdict: 'pass',
    judge: 'pen-review-loop',
  },
  timReady: {
    renamed: true,
    name: 'PROPOSAL / Chip · ready for Tim rabcdef01',
  },
  codeSync: { includesPenBlob: false, targets: ['packages/ui'] },
};

describe('design-write-swarm', () => {
  it('exposes lease → System-1 → code-sync contract', () => {
    assert.equal(WRITE_SWARM_CONTRACT.requiresLease, true);
    assert.equal(WRITE_SWARM_CONTRACT.requiresSystem1Panel, true);
    assert.equal(WRITE_SWARM_CONTRACT.forbidsInventAndRubberStamp, true);
    assert.equal(WRITE_SWARM_CONTRACT.dryMutatesPen, false);
    assert.equal(
      WRITE_SWARM_CONTRACT.lockProfile,
      'jovie-founder-design-studio'
    );
    assert.equal(WRITE_SWARM_STEPS.length, 8);
  });

  it('dry plan never claims Pen mutation', () => {
    const plan = planWriteSwarm({ mode: 'dry' });
    assert.equal(plan.contract.mutatesPen, false);
    assert.ok(plan.steps.every(s => s.mutatesPen === false));
  });

  it('rejects invent-and-rubber-stamp and mutate-without-lease', () => {
    const stamped = validateWriteSwarmReceipt({
      ...liveBase,
      inventAndRubberStamp: true,
      system1: {
        ...liveBase.system1,
        judge: 'write-swarm',
        selfApproved: true,
      },
    });
    assert.equal(stamped.ok, false);
    assert.ok(stamped.blockers.some(b => b.code === 'invent_and_rubber_stamp'));

    const noLease = validateWriteSwarmReceipt({
      ...liveBase,
      lease: {
        schema: 'pen-writer-lease/v1',
        holder: 'a',
        token: '',
        acquired: false,
      },
      system1: { ...liveBase.system1, source: 'writer-self' },
    });
    assert.equal(noLease.ok, false);
    assert.ok(
      noLease.blockers.some(b =>
        [
          'mutate_without_lease',
          'lease_not_acquired',
          'lease_token',
          'system1_source',
        ].includes(b.code)
      )
    );
  });

  it('accepts live receipt with lease + panel pass + Tim-ready', () => {
    const ok = validateWriteSwarmReceipt(liveBase);
    assert.equal(ok.ok, true, JSON.stringify(ok.blockers));
  });

  it('CLI dry-run prints mutatesPen false; validate fails rubber-stamp', () => {
    const dry = cli('dry-run');
    assert.equal(dry.status, 0, dry.stderr);
    const body = JSON.parse(dry.stdout);
    assert.equal(body.proof.mutatesPen, false);
    assert.equal(body.proof.forbidsInventAndRubberStamp, true);

    const dir = mkdtempSync(path.join(tmpdir(), 'write-swarm-'));
    const receipt = path.join(dir, 'bad.json');
    writeFileSync(
      receipt,
      JSON.stringify({ ...liveBase, inventAndRubberStamp: true })
    );
    const bad = cli('validate', '--receipt', receipt);
    assert.equal(bad.status, 1);
  });
});
