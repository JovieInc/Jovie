import { isAbsolute } from 'node:path';

export const PEN_LIVE_CANVAS_PERSIST_SCHEMA = 'pen-live-canvas-persist/v1';

const attachModes = new Set(['desktop']);
const persistSaveMethods = new Set([
  'save()',
  'Cmd-S',
  'editor-save',
  'save-document',
]);
const backupOverlaySources = new Set([
  'backup-copy',
  'pencil-backup',
]);

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function isPenPath(value) {
  return isAbsolute(value) && value.toLowerCase().endsWith('.pen');
}

function parseTimestamp(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return { timestamp: new Date(value).toISOString(), milliseconds: value };
  }
  const timestamp = text(value);
  const milliseconds = Date.parse(timestamp);
  return Number.isFinite(milliseconds) ? { timestamp, milliseconds } : null;
}

function parseByteSize(value) {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return value;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }
  return null;
}

function looksLikeSavePathArgument(value) {
  const candidate = text(value);
  if (!candidate) return false;
  return (
    /save\s*\(\s*\{[\s\S]*path\s*:/i.test(candidate) ||
    /^save\(\{path\}\)$/i.test(candidate)
  );
}

/**
 * Live-canvas attach and disk-persist gate.
 *
 * Attach does not bail on dirty/unsaved. Persist requires the locked
 * canonical file's mtime to move. `save()` printing Saved is not persist.
 * The gate never reads, writes, copies, or hashes `.pen` bytes.
 */
export function buildPenLiveCanvasPersistReceipt(input = {}) {
  const phase = text(input.phase) || 'persist';
  const workspaceProfile = text(input.workspaceProfile);
  const expectedPath = text(input.lockedExpectedPath);
  const activePath = text(input.activePath);
  const attachMode = text(input.attachMode);
  const writer = text(input.writer);
  const batchId = text(input.batchId);
  const dirtyState = text(input.dirtyState) || 'unknown';
  const outPath = text(input.outPath);
  const saveMethod = text(input.saveMethod);
  const saveArgument = text(input.saveArgument);
  const persistSource = text(input.persistSource);
  const saveResponse = text(input.saveResponse);
  const recordedAt = parseTimestamp(input.recordedAt);
  const mtimeBefore = parseTimestamp(input.mtimeBefore);
  const mtimeAfter = parseTimestamp(input.mtimeAfter);
  const sizeBefore = parseByteSize(input.sizeBefore);
  const sizeAfter = parseByteSize(input.sizeAfter);
  const blockers = [];
  const block = (code, message) => blockers.push({ code, message });

  if (phase !== 'attach' && phase !== 'persist') {
    block('phase_invalid', 'Phase must be attach or persist.');
  }
  if (!workspaceProfile) {
    block('workspace_profile_missing', 'A workspace profile is required.');
  }
  if (!isPenPath(expectedPath)) {
    block(
      'locked_path_invalid',
      'The workspace profile must resolve to an absolute .pen path.'
    );
  }
  if (!isPenPath(activePath)) {
    block(
      'active_path_invalid',
      'Active path must be an absolute .pen path.'
    );
  } else if (expectedPath && activePath !== expectedPath) {
    block(
      'active_path_mismatch',
      'Active path differs from the pinned file lock. Do not invent a second file.'
    );
  }
  if (!writer) {
    block('writer_missing', 'A coordinated active writer is required.');
  }
  if (!batchId) {
    block('batch_id_missing', 'A mutation batch ID is required.');
  }
  if (!attachModes.has(attachMode)) {
    block(
      'attach_mode_invalid',
      'CLI must attach to the live desktop canvas (`-a desktop`). Headless `-o` is a second file.'
    );
  }
  if (outPath) {
    block(
      'second_file_forbidden',
      '`--out` / a second .pen path is forbidden. Persist the locked live canvas only.'
    );
  }
  if (
    looksLikeSavePathArgument(saveMethod) ||
    looksLikeSavePathArgument(saveArgument)
  ) {
    block(
      'save_path_argument_unknown',
      'save({path}) is unknown and forbidden. It invents a second file.'
    );
  }
  if (
    backupOverlaySources.has(persistSource) ||
    backupOverlaySources.has(saveMethod)
  ) {
    block(
      'backup_overlay_forbidden',
      'Do not copy Pencil backups or Save As over the live canonical file.'
    );
  }
  if (!recordedAt) {
    block('recorded_at_invalid', 'A valid receipt timestamp is required.');
  }

  if (phase === 'persist') {
    if (!persistSaveMethods.has(saveMethod)) {
      block(
        'save_method_invalid',
        'Persist must use save(), Cmd-S, editor-save, or save-document on the attached canvas.'
      );
    }
    if (input.saveAcknowledged !== true) {
      block(
        'save_not_acknowledged',
        'Persist requires an acknowledged save() on the attached live canvas.'
      );
    }
    if (
      saveMethod === 'save()' &&
      saveResponse &&
      !/(?:Saved|save\(\)|Received response: save)/i.test(saveResponse)
    ) {
      block(
        'save_response_unbound',
        'save() response evidence does not contain Saved.'
      );
    }
    if (!mtimeBefore || !mtimeAfter) {
      block(
        'disk_mtime_missing',
        'Persist requires before/after mtime on the locked canonical path.'
      );
    } else if (mtimeAfter.milliseconds <= mtimeBefore.milliseconds) {
      block(
        'disk_mtime_unchanged',
        'save() printed Saved but the locked canonical file mtime did not move. That is not persist.'
      );
    }
    if (sizeBefore === null || sizeAfter === null) {
      block(
        'disk_size_missing',
        'Persist requires before/after byte size on the locked canonical path.'
      );
    }
  }

  const persistVerified =
    phase === 'persist' &&
    blockers.length === 0 &&
    mtimeBefore &&
    mtimeAfter &&
    mtimeAfter.milliseconds > mtimeBefore.milliseconds;

  let verdict = 'blocked';
  if (blockers.length === 0) {
    verdict = persistVerified ? 'disk_persist_verified' : 'live_canvas_attached';
  }

  return {
    schema: PEN_LIVE_CANVAS_PERSIST_SCHEMA,
    phase,
    workspace_profile: workspaceProfile || null,
    expected_path: expectedPath || null,
    active_path: activePath || null,
    attach_mode: attachMode || null,
    writer: writer || null,
    mutation_batch_id: batchId || null,
    dirty_state: dirtyState,
    dirty_or_unsaved_is_bail: false,
    out_path: outPath || null,
    save: {
      method: saveMethod || null,
      argument: saveArgument || null,
      acknowledged: input.saveAcknowledged === true,
      response: saveResponse || null,
    },
    persist_source: persistSource || null,
    disk: {
      mtime_before: mtimeBefore?.timestamp ?? null,
      mtime_after: mtimeAfter?.timestamp ?? null,
      size_before: sizeBefore,
      size_after: sizeAfter,
      mtime_moved: persistVerified,
    },
    recorded_at: recordedAt?.timestamp ?? null,
    verdict,
    durability: 'not_proven',
    blockers,
  };
}

export function exitCodeForPenLiveCanvasPersist(receipt) {
  if (receipt.verdict === 'disk_persist_verified') return 0;
  if (receipt.verdict === 'live_canvas_attached') return 0;
  return 1;
}
