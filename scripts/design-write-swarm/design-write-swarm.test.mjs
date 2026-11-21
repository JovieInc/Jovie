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

const CLI = fileURLToPath(new URL('./contract.mjs', import.meta.url));
const cli = (...a) =>
  spawnSync(process.execPath, [CLI, ...a], { encoding: 'utf8' });
const has = (r, code) => r.blockers.some(b => b.code === code);
const live = {
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
  it('contract + dry plan', () => {
    assert.equal(WRITE_SWARM_CONTRACT.forbidsInventAndRubberStamp, true);
    assert.equal(WRITE_SWARM_CONTRACT.dryMutatesPen, false);
    assert.equal(
      WRITE_SWARM_CONTRACT.lockProfile,
      'jovie-founder-design-studio'
    );
    assert.equal(WRITE_SWARM_STEPS.length, 8);
    const plan = planWriteSwarm({ mode: 'dry' });
    assert.equal(plan.contract.mutatesPen, false);
    assert.ok(plan.steps.every(s => s.mutatesPen === false));
  });

  it('rejects rubber-stamp, missing ids, mutate-without-lease', () => {
    const stamped = validateWriteSwarmReceipt({
      ...live,
      inventAndRubberStamp: true,
      system1: { ...live.system1, judge: 'write-swarm', selfApproved: true },
    });
    assert.equal(stamped.ok, false);
    assert.ok(has(stamped, 'invent_and_rubber_stamp'));
    const missing = validateWriteSwarmReceipt({
      ...live,
      mutate: { performed: true, writer: '' },
      system1: { ...live.system1, judge: '' },
    });
    assert.ok(has(missing, 'system1_judge') && has(missing, 'mutate_writer'));
    const noLease = validateWriteSwarmReceipt({
      ...live,
      lease: {
        schema: 'pen-writer-lease/v1',
        holder: 'a',
        token: '',
        acquired: false,
      },
      system1: { ...live.system1, source: 'writer-self' },
    });
    assert.ok(
      [
        'mutate_without_lease',
        'lease_not_acquired',
        'lease_token',
        'system1_source',
      ].some(c => has(noLease, c))
    );
  });

  it('rejects mutate/code-sync without system1 pass', () => {
    const failed = validateWriteSwarmReceipt({
      ...live,
      system1: { ...live.system1, verdict: 'fail' },
      timReady: { renamed: false },
      codeSync: undefined,
    });
    assert.ok(has(failed, 'mutate_without_system1_pass'));
    const sync = validateWriteSwarmReceipt({
      ...live,
      mutate: { performed: false, writer: 'write-swarm' },
      system1: { ...live.system1, verdict: 'pending' },
      timReady: { renamed: false },
      codeSync: { includesPenBlob: false, targets: ['packages/ui'] },
    });
    assert.ok(has(sync, 'mutate_without_system1_pass'));
    const bad = validateWriteSwarmReceipt({
      ...live,
      mutate: { performed: false, writer: 'write-swarm' },
      system1: { ...live.system1, verdict: 'fail' },
      timReady: { renamed: false },
      codeSync: true,
    });
    assert.ok(
      has(bad, 'code_sync_type') && has(bad, 'mutate_without_system1_pass')
    );
  });

  it('accepts live pass; CLI dry + validate', () => {
    assert.equal(validateWriteSwarmReceipt(live).ok, true);
    const dry = cli('dry-run');
    assert.equal(dry.status, 0, dry.stderr);
    const body = JSON.parse(dry.stdout);
    assert.equal(body.proof.mutatesPen, false);
    const receipt = path.join(
      mkdtempSync(path.join(tmpdir(), 'ws-')),
      'bad.json'
    );
    writeFileSync(
      receipt,
      JSON.stringify({ ...live, inventAndRubberStamp: true })
    );
    assert.equal(cli('validate', '--receipt', receipt).status, 1);
  });
});
