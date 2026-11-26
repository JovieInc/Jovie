/** JOV-13851 write swarm: lease→System-1→Tim-ready→code-sync. Dry never mutates Pen. */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const WRITE_SWARM_SCHEMA = 'jovie.design-write-swarm/v1';
export const PEN_REVIEW_RECEIPT_SCHEMA = 'pen-review-receipt/v1';
export const LEASE_SCHEMA = 'pen-writer-lease/v1';
export const LOCK_PROFILE = 'jovie-founder-design-studio';
export const CANONICAL_CANVAS =
  '~/Documents/Jovie/Jovie Marketing Workspace/Jovie Design Studio — canonical.lib.pen';
export const WRITE_SWARM_STEPS = Object.freeze([
  'attach',
  'lease',
  'mutate',
  'system1',
  'tim-ready',
  'persist',
  'code-sync',
  'release',
]);
export const WRITE_SWARM_CONTRACT = Object.freeze({
  schema: WRITE_SWARM_SCHEMA,
  mutatesPen: true,
  dryMutatesPen: false,
  requiresLease: true,
  requiresSystem1Panel: true,
  forbidsInventAndRubberStamp: true,
  lockProfile: LOCK_PROFILE,
  canonicalCanvas: CANONICAL_CANVAS,
  attach: 'pen interactive -a desktop',
  forbidPenBlobsInPr: true,
  steps: WRITE_SWARM_STEPS,
});

const t = v => (typeof v === 'string' ? v.trim() : '');
const obj = v => (v && typeof v === 'object' && !Array.isArray(v) ? v : null);
/** Fail-closed claim flag: boolean true or string "true" both count as yes. */
const yes = v => v === true || v === 'true';

export function planWriteSwarm(opts = {}) {
  const mode = opts.mode === 'live' ? 'live' : 'dry';
  const holder = t(opts.holder) || 'write-swarm';
  const scope = t(opts.scope) || 'atomic-component-slice';
  const frameIds = Array.isArray(opts.frameIds)
    ? opts.frameIds.map(String).filter(Boolean)
    : [];
  const live = new Set(['mutate', 'tim-ready', 'persist']);
  const frames = frameIds.length ? frameIds.join(',') : '<frameIds>';
  const cmd = {
    attach: WRITE_SWARM_CONTRACT.attach,
    lease: `node scripts/pen-review/run.mjs lease acquire --holder ${holder} --scope ${scope}`,
    mutate: 'Atomic Pen edit under lease',
    system1: `node scripts/pen-review/run.mjs review --frames ${frames}`,
    'tim-ready': 'markReady → · ready for Tim r<receipt>',
    persist: 'save() + pen-live-canvas-persist',
    'code-sync': 'PR: tokens/packages/ui/bindings (no *.pen)',
    release: `node scripts/pen-review/run.mjs lease release --holder ${holder} --token <token>`,
  };
  return {
    schema: WRITE_SWARM_SCHEMA,
    mode,
    contract: { ...WRITE_SWARM_CONTRACT, mutatesPen: mode === 'live' },
    holder,
    scope,
    frameIds,
    steps: WRITE_SWARM_STEPS.map(id => ({
      id,
      mutatesPen: mode === 'live' && live.has(id),
      command: mode === 'dry' ? `dry:${id}` : (cmd[id] ?? id),
    })),
  };
}

export function validateWriteSwarmReceipt(receipt) {
  const blockers = [];
  const block = (code, message) => blockers.push({ code, message });
  const doc = obj(receipt);
  if (!doc) {
    block('receipt_missing', 'receipt required');
    return { ok: false, schema: WRITE_SWARM_SCHEMA, blockers };
  }
  if (t(doc.schema) !== WRITE_SWARM_SCHEMA)
    block('schema_mismatch', WRITE_SWARM_SCHEMA);
  const mode =
    t(doc.mode) === 'live' ? 'live' : t(doc.mode) === 'dry' ? 'dry' : '';
  if (!mode) block('mode_missing', 'dry|live');
  if (yes(doc.inventAndRubberStamp))
    block('invent_and_rubber_stamp', 'forbidden');

  const lease = obj(doc.lease);
  const system1 = obj(doc.system1);
  const mutatePresent = doc.mutate !== undefined && doc.mutate !== null;
  const mutate = obj(doc.mutate);
  const timReadyPresent = doc.timReady !== undefined && doc.timReady !== null;
  const timReady = obj(doc.timReady);
  const codeSyncPresent = doc.codeSync !== undefined && doc.codeSync !== null;
  const codeSync = obj(doc.codeSync);
  // Truthy non-objects (mutate:true) must not bypass gates via obj()→null.
  const mutated = yes(mutate?.performed) || (mutatePresent && !mutate);
  const renamed = yes(timReady?.renamed) || (timReadyPresent && !timReady);

  if (mode === 'dry') {
    if (yes(doc.mutatesPen)) block('dry_mutates_pen', 'mutatesPen=false');
    if (mutated) block('dry_mutate_performed', 'no mutate');
    if (renamed) block('dry_tim_ready', 'no rename');
  }

  if (mode === 'live') {
    if (!lease) block('lease_missing', 'lease required');
    else {
      if (t(lease.schema) !== LEASE_SCHEMA) block('lease_schema', LEASE_SCHEMA);
      if (!t(lease.holder)) block('lease_holder', 'holder');
      if (!t(lease.token)) block('lease_token', 'token');
      if (!yes(lease.acquired)) block('lease_not_acquired', 'acquired');
    }
    if (mutatePresent && !mutate) block('mutate_type', 'object');
    if (timReadyPresent && !timReady) block('tim_ready_type', 'object');
    if (mutated && (!lease || !yes(lease?.acquired) || !t(lease?.token)))
      block('mutate_without_lease', 'need lease token');
    if (!system1) block('system1_missing', 'system1 required');
    else {
      if (t(system1.source) !== 'pen-review-panel')
        block('system1_source', 'pen-review-panel');
      if (t(system1.receiptSchema) !== PEN_REVIEW_RECEIPT_SCHEMA)
        block('system1_receipt_schema', PEN_REVIEW_RECEIPT_SCHEMA);
      if (!['pass', 'fail', 'pending'].includes(t(system1.verdict)))
        block('system1_verdict', 'pass|fail|pending');
      const writer = t(mutate?.writer);
      const judge = t(system1.judge);
      if (!judge) block('system1_judge', 'judge required');
      if (mutated && mutate && !writer)
        block('mutate_writer', 'writer required');
      if (yes(system1.selfApproved) || (writer && judge && writer === judge))
        block('invent_and_rubber_stamp', 'writer≠judge');
    }
    if (codeSyncPresent && !codeSync) block('code_sync_type', 'object');
    const needsPass = mutated || codeSyncPresent || renamed;
    if (needsPass && t(system1?.verdict) !== 'pass')
      block('mutate_without_system1_pass', 'need system1 pass');
    if (
      yes(timReady?.renamed) &&
      (!t(timReady.name) ||
        !/ · ready for Tim r[0-9a-f]{8}$/.test(t(timReady.name)))
    )
      block('tim_ready_name', '· ready for Tim r<8hex>');
    if (yes(codeSync?.includesPenBlob))
      block('pen_blob_in_code_sync', 'no *.pen');
  }

  return {
    ok: blockers.length === 0,
    schema: WRITE_SWARM_SCHEMA,
    blockers,
    mode,
    mutatesPen: mode === 'live',
  };
}

function main(argv) {
  const [cmd, ...rest] = argv;
  const opt = {};
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === '--live') opt.live = true;
    else if (a === '--holder') opt.holder = rest[++i];
    else if (a === '--scope') opt.scope = rest[++i];
    else if (a === '--frames') opt.frames = rest[++i];
    else if (a === '--receipt') opt.receipt = rest[++i];
  }
  const out = (v, code = 0) => {
    console.log(JSON.stringify(v, null, 2));
    process.exitCode = code;
  };
  if (cmd === 'list') {
    out({ contract: WRITE_SWARM_CONTRACT, modes: ['dry', 'live'] });
    return;
  }
  if (cmd === 'plan' || cmd === 'dry-run') {
    const plan = planWriteSwarm({
      mode: cmd === 'dry-run' ? 'dry' : opt.live ? 'live' : 'dry',
      holder: opt.holder,
      scope: opt.scope,
      frameIds: opt.frames ? opt.frames.split(',').map(s => s.trim()) : [],
    });
    out({
      ...plan,
      proof: {
        mutatesPen: plan.contract.mutatesPen,
        forbidsInventAndRubberStamp: true,
        attachPath: CANONICAL_CANVAS,
      },
    });
    return;
  }
  if (cmd === 'validate') {
    if (!opt.receipt) {
      process.exitCode = 1;
      return;
    }
    const r = validateWriteSwarmReceipt(
      JSON.parse(readFileSync(opt.receipt, 'utf8'))
    );
    out(r, r.ok ? 0 : 1);
    return;
  }
  console.log(
    'Usage: list|plan [--live]|dry-run|validate --receipt <path>\nAttach: pen interactive -a desktop (lock jovie-founder-design-studio)'
  );
  process.exitCode = cmd ? 1 : 0;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))
) {
  main(process.argv.slice(2));
}
