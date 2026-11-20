/**
 * Data-backed Pen ship path (JOV-13853).
 * CI/preflight forbid .pen blobs; receipts prove live persist + lease +
 * registry map + code sync. Never treat Pen-through-CI as required.
 */

export const PEN_DATA_BACKED_SHIP_SCHEMA = 'jovie.pen-data-backed-ship/v1';
export const PERSIST_SCHEMA = 'pen-live-canvas-persist/v1';

/** @param {string} path */
export function isPenBlobPath(path) {
  const normalized = String(path ?? '')
    .replaceAll('\\', '/')
    .trim();
  if (!normalized) return false;
  return /\.pen$/i.test(normalized.split('/').pop() ?? '');
}

/**
 * @param {readonly string[]} paths
 * @returns {{ ok: boolean, penBlobs: string[], blockers: {code:string,message:string}[] }}
 */
export function checkChangedPathsForPenBlobs(paths) {
  const penBlobs = [...new Set(paths.filter(isPenBlobPath))].sort();
  const blockers = penBlobs.map(path => ({
    code: 'pen_blob_in_diff',
    message: `${path}: .pen blobs must not enter the merge queue (JOV-13853). Use live persist + registry + code sync.`,
  }));
  return { ok: blockers.length === 0, penBlobs, blockers };
}

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * @param {unknown} receipt
 * @returns {{ ok: boolean, schema: string, blockers: {code:string,message:string}[], summary: Record<string, unknown> }}
 */
export function validateDataBackedShipReceipt(receipt) {
  /** @type {{code:string,message:string}[]} */
  const blockers = [];
  const block = (code, message) => blockers.push({ code, message });
  const doc =
    receipt && typeof receipt === 'object'
      ? /** @type {Record<string, unknown>} */ (receipt)
      : null;

  if (!doc) {
    block('receipt_missing', 'Ship receipt object is required.');
    return {
      ok: false,
      schema: PEN_DATA_BACKED_SHIP_SCHEMA,
      blockers,
      summary: {},
    };
  }

  if (text(doc.schema) !== PEN_DATA_BACKED_SHIP_SCHEMA) {
    block(
      'schema_mismatch',
      `Expected schema ${PEN_DATA_BACKED_SHIP_SCHEMA}.`
    );
  }

  const persist =
    doc.livePersist && typeof doc.livePersist === 'object'
      ? /** @type {Record<string, unknown>} */ (doc.livePersist)
      : null;
  if (!persist) {
    block('live_persist_missing', 'livePersist receipt is required.');
  } else {
    if (text(persist.schema) !== PERSIST_SCHEMA) {
      block(
        'live_persist_schema',
        `livePersist.schema must be ${PERSIST_SCHEMA}.`
      );
    }
    if (text(persist.verdict) !== 'disk_persist_verified') {
      block(
        'live_persist_not_verified',
        'livePersist.verdict must be disk_persist_verified (mtime moved).'
      );
    }
  }

  const lease =
    doc.leaseSave && typeof doc.leaseSave === 'object'
      ? /** @type {Record<string, unknown>} */ (doc.leaseSave)
      : null;
  if (!lease) {
    block('lease_save_missing', 'leaseSave evidence is required.');
  } else {
    if (!text(lease.holder))
      block('lease_holder_missing', 'leaseSave.holder is required.');
    if (!text(lease.tokenRef) && !text(/** @type {string} */ (lease.token))) {
      block(
        'lease_token_missing',
        'leaseSave.token or tokenRef is required (do not commit raw secrets).'
      );
    }
    const touched = lease.touched;
    if (!Array.isArray(touched) || touched.length === 0) {
      block(
        'lease_touched_missing',
        'leaseSave.touched must list top-level Pen ids.'
      );
    }
  }

  const registry =
    doc.registryMap && typeof doc.registryMap === 'object'
      ? /** @type {Record<string, unknown>} */ (doc.registryMap)
      : null;
  if (!registry) {
    block('registry_map_missing', 'registryMap is required.');
  } else {
    const ids = registry.identities;
    if (!Array.isArray(ids) || ids.length === 0) {
      block(
        'registry_identities_missing',
        'registryMap.identities must be a nonempty code-registry id list.'
      );
    } else if (ids.some(id => typeof id !== 'string' || !id.trim())) {
      block(
        'registry_identities_invalid',
        'registryMap.identities must be nonempty strings.'
      );
    }
  }

  const codePaths = doc.codeSyncPaths;
  if (!Array.isArray(codePaths) || codePaths.length === 0) {
    block(
      'code_sync_missing',
      'codeSyncPaths must list the small code sync PR paths (no .pen).'
    );
  } else {
    const penInCode = codePaths.filter(
      p => typeof p === 'string' && isPenBlobPath(p)
    );
    if (penInCode.length > 0) {
      block(
        'code_sync_contains_pen',
        `codeSyncPaths must not include .pen blobs: ${penInCode.join(', ')}`
      );
    }
  }

  if (doc.parityProbe != null) {
    const probe =
      typeof doc.parityProbe === 'object'
        ? /** @type {Record<string, unknown>} */ (doc.parityProbe)
        : null;
    const status = text(probe?.status);
    if (!['skipped', 'passed', 'failed'].includes(status)) {
      block(
        'parity_probe_status',
        'parityProbe.status must be skipped | passed | failed.'
      );
    }
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

/**
 * Pilot receipt shape used by docs/tests — no .pen blob, contracts only.
 * @param {Partial<Record<string, unknown>>} [overrides]
 */
export function buildPilotShipReceipt(overrides = {}) {
  return {
    schema: PEN_DATA_BACKED_SHIP_SCHEMA,
    issue: 'JOV-13853',
    livePersist: {
      schema: PERSIST_SCHEMA,
      verdict: 'disk_persist_verified',
      note: 'Pilot documents the path; live mtime gate remains pen-live-canvas-persist.',
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
    parityProbe: { status: 'skipped', note: 'Docs/guard pilot; no UI surface.' },
    ...overrides,
  };
}
