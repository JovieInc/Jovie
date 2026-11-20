/**
 * Data-backed Pen ship path (JOV-13853). Forbid .pen blobs; receipts prove
 * live persist + lease + registry map + code sync — not Pen-through-CI.
 */

export const PEN_DATA_BACKED_SHIP_SCHEMA = 'jovie.pen-data-backed-ship/v1';
export const PERSIST_SCHEMA = 'pen-live-canvas-persist/v1';

/** @param {string} path */
export function isPenBlobPath(path) {
  const name = String(path ?? '')
    .replaceAll('\\', '/')
    .trim()
    .split('/')
    .pop();
  return Boolean(name && /\.pen$/i.test(name));
}

/** @param {readonly string[]} paths */
export function checkChangedPathsForPenBlobs(paths) {
  const penBlobs = [...new Set(paths.filter(isPenBlobPath))].sort();
  return {
    ok: penBlobs.length === 0,
    penBlobs,
    blockers: penBlobs.map(path => ({
      code: 'pen_blob_in_diff',
      message: `${path}: .pen blobs must not enter the merge queue (JOV-13853).`,
    })),
  };
}

const t = v => (typeof v === 'string' ? v.trim() : '');
const obj = v => (v && typeof v === 'object' ? v : null);

/** @param {unknown} receipt */
export function validateDataBackedShipReceipt(receipt) {
  /** @type {{code:string,message:string}[]} */
  const blockers = [];
  const block = (code, message) => blockers.push({ code, message });
  const doc = obj(receipt);
  if (!doc) {
    block('receipt_missing', 'Ship receipt object is required.');
    return {
      ok: false,
      schema: PEN_DATA_BACKED_SHIP_SCHEMA,
      blockers,
      summary: {},
    };
  }
  if (t(doc.schema) !== PEN_DATA_BACKED_SHIP_SCHEMA) {
    block('schema_mismatch', `Expected ${PEN_DATA_BACKED_SHIP_SCHEMA}.`);
  }

  const persist = obj(doc.livePersist);
  if (!persist) block('live_persist_missing', 'livePersist is required.');
  else {
    if (t(persist.schema) !== PERSIST_SCHEMA)
      block('live_persist_schema', `Need ${PERSIST_SCHEMA}.`);
    if (t(persist.verdict) !== 'disk_persist_verified')
      block(
        'live_persist_not_verified',
        'livePersist.verdict must be disk_persist_verified.'
      );
  }

  const lease = obj(doc.leaseSave);
  if (!lease) block('lease_save_missing', 'leaseSave is required.');
  else {
    if (!t(lease.holder)) block('lease_holder_missing', 'leaseSave.holder required.');
    if (!t(lease.tokenRef) && !t(lease.token))
      block('lease_token_missing', 'leaseSave.token or tokenRef required.');
    if (!Array.isArray(lease.touched) || lease.touched.length === 0)
      block('lease_touched_missing', 'leaseSave.touched must list Pen ids.');
  }

  const registry = obj(doc.registryMap);
  if (!registry) block('registry_map_missing', 'registryMap is required.');
  else {
    const ids = registry.identities;
    if (!Array.isArray(ids) || ids.length === 0)
      block('registry_identities_missing', 'registryMap.identities required.');
    else if (ids.some(id => typeof id !== 'string' || !id.trim()))
      block('registry_identities_invalid', 'identities must be nonempty strings.');
  }

  const codePaths = doc.codeSyncPaths;
  if (!Array.isArray(codePaths) || codePaths.length === 0) {
    block('code_sync_missing', 'codeSyncPaths must list code sync paths (no .pen).');
  } else {
    const pens = codePaths.filter(p => typeof p === 'string' && isPenBlobPath(p));
    if (pens.length)
      block('code_sync_contains_pen', `codeSyncPaths has .pen: ${pens.join(', ')}`);
  }

  if (doc.parityProbe != null) {
    const status = t(obj(doc.parityProbe)?.status);
    if (!['skipped', 'passed', 'failed'].includes(status))
      block('parity_probe_status', 'parityProbe.status: skipped|passed|failed.');
  }

  return {
    ok: blockers.length === 0,
    schema: PEN_DATA_BACKED_SHIP_SCHEMA,
    blockers,
    summary: {
      hasLivePersist: Boolean(persist),
      hasLeaseSave: Boolean(lease),
      hasRegistryMap: Boolean(registry),
      codeSyncCount: Array.isArray(codePaths) ? codePaths.length : 0,
      parityProbe: doc.parityProbe ?? null,
    },
  };
}

/** @param {Partial<Record<string, unknown>>} [overrides] */
export function buildPilotShipReceipt(overrides = {}) {
  return {
    schema: PEN_DATA_BACKED_SHIP_SCHEMA,
    issue: 'JOV-13853',
    livePersist: {
      schema: PERSIST_SCHEMA,
      verdict: 'disk_persist_verified',
      note: 'Pilot; live mtime gate remains pen-live-canvas-persist.',
    },
    leaseSave: {
      holder: 'jov-13853-pilot',
      tokenRef: 'lease-local-only',
      touched: ['pilot-frame'],
    },
    registryMap: {
      source: 'apps/web/data/marketing/componentRegistry.ts',
      identities: ['shell.marketingheader'],
    },
    codeSyncPaths: [
      'docs/design-system/DATA_BACKED_SHIP_PATH.md',
      'scripts/design/pen-data-backed-ship-lib.mjs',
      'scripts/design/pen-data-backed-ship.mjs',
      'scripts/design/pen-data-backed-ship.test.mjs',
      '.claude/rules/pen.md',
      'package.json',
    ],
    parityProbe: { status: 'skipped', note: 'Docs/guard pilot.' },
    ...overrides,
  };
}
