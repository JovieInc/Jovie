/**
 * Design write swarm (JOV-13851): lease → System-1 → Tim-ready → code sync.
 * Dry never mutates Pen; live requires pen-review lease + panel (no rubber-stamp).
 */

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
  leaseCli:
    'node scripts/pen-review/run.mjs lease acquire --holder <you> --scope <slice>',
  system1:
    'node scripts/pen-review/run.mjs review --frames <ids> (System-1 panel)',
  timReady: '· ready for Tim r<receipt> only after quiet System-1 rounds',
  codeSync: ['tokens', 'packages/ui', 'pen-bindings', 'consumers'],
  forbidPenBlobsInPr: true,
  steps: WRITE_SWARM_STEPS,
});

const t = v => (typeof v === 'string' ? v.trim() : '');
const obj = v => (v && typeof v === 'object' && !Array.isArray(v) ? v : null);

/** @param {{ mode?: 'dry'|'live', holder?: string, scope?: string, frameIds?: string[] }} [opts] */
export function planWriteSwarm(opts = {}) {
  const mode = opts.mode === 'live' ? 'live' : 'dry';
  const holder = t(opts.holder) || 'write-swarm';
  const scope = t(opts.scope) || 'atomic-component-slice';
  const frameIds = Array.isArray(opts.frameIds)
    ? opts.frameIds.map(String).filter(Boolean)
    : [];
  const liveMutate = new Set(['mutate', 'tim-ready', 'persist']);
  return {
    schema: WRITE_SWARM_SCHEMA,
    mode,
    contract: { ...WRITE_SWARM_CONTRACT, mutatesPen: mode === 'live' },
    holder,
    scope,
    frameIds,
    steps: WRITE_SWARM_STEPS.map(id => ({
      id,
      mutatesPen: mode === 'live' && liveMutate.has(id),
      command: stepCommand(id, { mode, holder, scope, frameIds }),
    })),
    note:
      mode === 'dry'
        ? 'Dry: contract/plan only. Attach Tim canvas for live; do not invent Pen mutations.'
        : 'Live requires jovie-founder-design-studio lease on Tim’s open canvas.',
  };
}

function stepCommand(id, { mode, holder, scope, frameIds }) {
  if (mode === 'dry') return `dry:${id}`;
  const frames = frameIds.length ? frameIds.join(',') : '<frameIds>';
  const map = {
    attach: WRITE_SWARM_CONTRACT.attach,
    lease: `node scripts/pen-review/run.mjs lease acquire --holder ${holder} --scope ${scope}`,
    mutate: 'Atomic Pen edit under lease (one slice)',
    system1: `node scripts/pen-review/run.mjs review --frames ${frames}`,
    'tim-ready': 'pen-review markReady → · ready for Tim r<receipt>',
    persist: 'save() then pen-live-canvas-persist.mjs --phase persist',
    'code-sync': 'Small PR: tokens / packages/ui / bindings (no *.pen)',
    release: `node scripts/pen-review/run.mjs lease release --holder ${holder} --token <token>`,
  };
  return map[id] ?? id;
}

/** @param {unknown} receipt */
export function validateWriteSwarmReceipt(receipt) {
  /** @type {{code:string,message:string}[]} */
  const blockers = [];
  const block = (code, message) => blockers.push({ code, message });
  const doc = obj(receipt);
  if (!doc) {
    block('receipt_missing', 'Write-swarm receipt object is required.');
    return { ok: false, schema: WRITE_SWARM_SCHEMA, blockers };
  }
  if (t(doc.schema) !== WRITE_SWARM_SCHEMA)
    block('schema_mismatch', `Expected ${WRITE_SWARM_SCHEMA}.`);
  const mode =
    t(doc.mode) === 'live' ? 'live' : t(doc.mode) === 'dry' ? 'dry' : '';
  if (!mode) block('mode_missing', 'mode must be dry or live.');
  if (doc.inventAndRubberStamp === true)
    block(
      'invent_and_rubber_stamp',
      'inventAndRubberStamp=true is forbidden (JOV-13851).'
    );

  const lease = obj(doc.lease);
  const system1 = obj(doc.system1);
  const mutate = obj(doc.mutate);
  const timReady = obj(doc.timReady);
  const codeSyncPresent = doc.codeSync !== undefined && doc.codeSync !== null;
  const codeSync = obj(doc.codeSync);

  if (mode === 'dry') {
    if (doc.mutatesPen === true)
      block('dry_mutates_pen', 'Dry receipts must set mutatesPen=false.');
    if (mutate?.performed === true)
      block('dry_mutate_performed', 'Dry mode must not perform Pen mutations.');
    if (timReady?.renamed === true)
      block('dry_tim_ready', 'Dry mode must not rename frames.');
  }

  if (mode === 'live') {
    if (!lease) block('lease_missing', 'live lease is required.');
    else {
      if (t(lease.schema) !== LEASE_SCHEMA)
        block('lease_schema', `lease.schema must be ${LEASE_SCHEMA}.`);
      if (!t(lease.holder)) block('lease_holder', 'lease.holder is required.');
      if (!t(lease.token))
        block('lease_token', 'lease.token is required for live writes.');
      if (lease.acquired !== true)
        block('lease_not_acquired', 'lease.acquired must be true.');
    }
    if (
      mutate?.performed === true &&
      (!lease || lease.acquired !== true || !t(lease?.token))
    ) {
      block(
        'mutate_without_lease',
        'Pen mutate requires an acquired lease token.'
      );
    }
    if (!system1)
      block('system1_missing', 'system1 panel receipt is required.');
    else {
      if (t(system1.source) !== 'pen-review-panel')
        block(
          'system1_source',
          'system1.source must be pen-review-panel (not writer self-verdict).'
        );
      if (t(system1.receiptSchema) !== PEN_REVIEW_RECEIPT_SCHEMA)
        block(
          'system1_receipt_schema',
          `system1.receiptSchema must be ${PEN_REVIEW_RECEIPT_SCHEMA}.`
        );
      if (!['pass', 'fail', 'pending'].includes(t(system1.verdict)))
        block('system1_verdict', 'system1.verdict must be pass|fail|pending.');
      const writer = t(mutate?.writer);
      const judge = t(system1.judge);
      // Fail closed: missing identities must not bypass anti-rubber-stamp.
      if (!judge)
        block('system1_judge', 'system1.judge is required in live mode.');
      if (mutate?.performed === true && !writer)
        block(
          'mutate_writer',
          'mutate.writer is required when mutate.performed.'
        );
      if (
        system1.selfApproved === true ||
        (writer && judge && writer === judge)
      )
        block(
          'invent_and_rubber_stamp',
          'Writer must not System-1 self-approve (invent-and-rubber-stamp).'
        );
    }
    // Fail closed: truthy non-objects (true/"done") must not bypass panel pass.
    if (codeSyncPresent && !codeSync)
      block('code_sync_type', 'codeSync must be an object when present.');
    // Landing receipts: mutate or code-sync claim require panel pass (not only Tim-ready).
    const needsPanelPass =
      mutate?.performed === true ||
      codeSyncPresent ||
      timReady?.renamed === true;
    if (needsPanelPass && t(system1?.verdict) !== 'pass') {
      block(
        'mutate_without_system1_pass',
        'mutate/code-sync/Tim-ready require system1.verdict=pass from pen-review.'
      );
    }
    if (timReady?.renamed === true) {
      if (
        !t(timReady.name) ||
        !/ready for Tim r[0-9a-f]{8}/.test(timReady.name)
      )
        block(
          'tim_ready_name',
          'timReady.name must include · ready for Tim r<8 hex>.'
        );
    }
    if (codeSync?.includesPenBlob === true)
      block(
        'pen_blob_in_code_sync',
        '*.pen blobs must not enter the code-sync PR.'
      );
  }

  return {
    ok: blockers.length === 0,
    schema: WRITE_SWARM_SCHEMA,
    blockers,
    mode,
    mutatesPen: mode === 'live',
  };
}
