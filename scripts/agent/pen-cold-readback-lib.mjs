import { isAbsolute } from 'node:path';

export const PEN_COLD_READBACK_SCHEMA = 'pen-cold-readback/v1';
export const PEN_PROMOTION_GATE_SCHEMA = 'pen-promotion-gate/v1';
export const PEN_SAVE_RECEIPT_SCHEMA_REF = 'pen-save-receipt/v1';

const editedTitlePattern = /(?:^|\s)[—-]?\s*Edited\s*$/i;
const sha256Pattern = /^[a-f0-9]{64}$/;
const componentLinePattern = /^([A-Za-z0-9_-]+)::(.+)$/;

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function parseTimestamp(value) {
  const timestamp = text(value);
  const milliseconds = Date.parse(timestamp);
  return Number.isFinite(milliseconds) ? { timestamp, milliseconds } : null;
}

/**
 * Maps raw pen CLI output (stdout + stderr) to typed reason codes.
 * Order matters: the first matching signature wins.
 */
export function mapPenCliFailure(output) {
  const haystack = text(output);
  if (!haystack) return [];
  const signatures = [
    [
      /authentication required|pen login|PEN_CLI_KEY|not authenticated/i,
      'auth_unavailable',
    ],
    [/Base URI must be absolute/i, 'scene_graph_base_uri_not_absolute'],
    [/Export bounding box is invalid/i, 'export_bbox_invalid'],
    [/Error loading scene graph/i, 'scene_graph_load_failed'],
  ];
  const reasons = [];
  for (const [pattern, code] of signatures) {
    if (pattern.test(haystack) && !reasons.includes(code)) reasons.push(code);
  }
  return reasons;
}

/**
 * Extracts reusable component metadata lines (`<id>::<name>`) printed by the
 * read-only execute probe. Returns a deterministically ordered list.
 */
export function parseComponentListing(output) {
  const components = [];
  for (const line of text(output).split('\n')) {
    const match = componentLinePattern.exec(line.trim());
    if (match) components.push({ id: match[1], name: match[2].trim() });
  }
  const seen = new Set();
  return components
    .filter(component => {
      const key = `${component.id}::${component.name}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.id.localeCompare(b.id) || a.name.localeCompare(b.name));
}

export function buildPenColdReadbackReceipt(input = {}) {
  const mode = input.mode === 'fixture' ? 'fixture' : 'canonical';
  const targetPath = text(input.targetPath);
  const workspaceProfile = text(input.workspaceProfile);
  const sha256Before = text(input.fileSha256Before);
  const sha256After = text(input.fileSha256After);
  const recordedAt = parseTimestamp(input.recordedAt);
  const desktopTitle = text(input.desktopTitle);
  const desktopDirtyState = text(input.desktopDirtyState);
  const expectedComponents = [
    ...new Set(
      (Array.isArray(input.expectedComponents) ? input.expectedComponents : [])
        .map(text)
        .filter(Boolean)
    ),
  ];
  const components = Array.isArray(input.components) ? input.components : [];
  const typedReasons = [
    ...new Set(
      (Array.isArray(input.typedReasons) ? input.typedReasons : [])
        .map(text)
        .filter(Boolean)
    ),
  ];
  const blockers = [];
  const block = (code, message) => blockers.push({ code, message });

  if (mode === 'canonical' && !workspaceProfile) {
    block('workspace_profile_missing', 'A workspace profile is required.');
  }
  if (!isAbsolute(targetPath) || !targetPath.toLowerCase().endsWith('.pen')) {
    block(
      'target_path_invalid',
      'Target must resolve to an absolute .pen path.'
    );
  }
  if (!sha256Pattern.test(sha256Before)) {
    block('sha256_before_missing', 'A pre-readback file hash is required.');
  }
  if (!sha256Pattern.test(sha256After)) {
    block('sha256_after_missing', 'A post-readback file hash is required.');
  }
  if (
    sha256Pattern.test(sha256Before) &&
    sha256Pattern.test(sha256After) &&
    sha256Before !== sha256After
  ) {
    block(
      'bytes_changed_during_readback',
      'Target bytes changed during a read-only cold readback.'
    );
  }
  if (input.saveInvoked === true) {
    block(
      'save_invoked_during_readback',
      'Cold readback must never invoke save.'
    );
  }
  if (!recordedAt) {
    block('recorded_at_invalid', 'A valid receipt timestamp is required.');
  }
  for (const reason of typedReasons) {
    block('cli_failure', `pen CLI failed: ${reason}.`);
  }
  if (typedReasons.length === 0 && input.cliExitCode !== 0) {
    block(
      'cli_exit_nonzero',
      `pen CLI exited with code ${String(input.cliExitCode)}.`
    );
  }
  for (const expected of expectedComponents) {
    if (!components.some(component => component.id === expected)) {
      block(
        'expected_component_missing',
        `Reusable component ${expected} was not read back.`
      );
    }
  }
  if (desktopTitle && editedTitlePattern.test(desktopTitle)) {
    block(
      'desktop_dirty_after_save',
      'Desktop title still reports Edited after the claimed save.'
    );
  }
  if (desktopDirtyState && desktopDirtyState !== 'clean') {
    block(
      'desktop_dirty_after_save',
      `Desktop dirty state is ${desktopDirtyState}, not clean.`
    );
  }

  return {
    schema: PEN_COLD_READBACK_SCHEMA,
    mode,
    workspace_profile: workspaceProfile || null,
    target_path: targetPath || null,
    file_sha256_before: sha256Before || null,
    file_sha256_after: sha256After || null,
    bytes_unchanged:
      sha256Pattern.test(sha256Before) && sha256Before === sha256After,
    save_invoked: input.saveInvoked === true,
    components,
    component_count: components.length,
    typed_reasons: typedReasons,
    desktop_title: desktopTitle || null,
    desktop_dirty_state: desktopDirtyState || null,
    recorded_at: recordedAt?.timestamp ?? null,
    verdict:
      blockers.length === 0 ? 'cold_readback_verified' : 'cold_readback_failed',
    durability: 'not_proven',
    blockers,
  };
}

export function exitCodeForPenColdReadback(receipt) {
  return receipt.verdict === 'cold_readback_verified' ? 0 : 1;
}

const desktopDirtyBlockers = new Set([
  'document_title_edited',
  'dirty_or_unknown',
]);

/**
 * Fallback gate: evaluates the strongest truthful verification claim a Pen
 * promotion may make, given a save receipt and an optional cold-readback
 * receipt. Live-app readback alone can never claim a cold round trip.
 */
export function evaluatePenPromotionClaim(input = {}) {
  const saveReceipt = input.saveReceipt ?? null;
  const coldReceipt = input.coldReadbackReceipt ?? null;
  const reasons = [];
  const reason = (code, message) => reasons.push({ code, message });

  if (!saveReceipt || typeof saveReceipt !== 'object') {
    reason(
      'save_receipt_missing',
      'A pen-save-receipt/v1 receipt is required.'
    );
    return {
      schema: PEN_PROMOTION_GATE_SCHEMA,
      claim: 'unverified',
      reasons,
    };
  }
  if (saveReceipt.schema !== PEN_SAVE_RECEIPT_SCHEMA_REF) {
    reason(
      'save_receipt_invalid',
      'Save receipt schema is not pen-save-receipt/v1.'
    );
  }
  if (saveReceipt.verdict !== 'saved_state_verified') {
    for (const blocker of saveReceipt.blockers ?? []) {
      if (desktopDirtyBlockers.has(blocker.code)) {
        reason(
          'desktop_dirty_after_save',
          'The desktop remained dirty after the claimed save.'
        );
      } else {
        reason(blocker.code ?? 'save_receipt_blocked', blocker.message ?? '');
      }
    }
    if ((saveReceipt.blockers ?? []).length === 0) {
      reason('save_receipt_blocked', 'Save receipt verdict is not verified.');
    }
    return {
      schema: PEN_PROMOTION_GATE_SCHEMA,
      claim: 'unverified',
      reasons,
    };
  }

  if (!coldReceipt || typeof coldReceipt !== 'object') {
    reason(
      'cold_readback_receipt_missing',
      'Only live-app readback evidence exists; no cold readback was recorded.'
    );
    return {
      schema: PEN_PROMOTION_GATE_SCHEMA,
      claim: 'live_readback_only',
      reasons,
    };
  }
  if (coldReceipt.schema !== PEN_COLD_READBACK_SCHEMA) {
    reason(
      'cold_readback_receipt_invalid',
      'Cold-readback receipt schema is not pen-cold-readback/v1.'
    );
  } else {
    if (coldReceipt.verdict !== 'cold_readback_verified') {
      for (const blocker of coldReceipt.blockers ?? []) {
        reason(blocker.code ?? 'cold_readback_failed', blocker.message ?? '');
      }
      if ((coldReceipt.blockers ?? []).length === 0) {
        reason(
          'cold_readback_failed',
          'Cold-readback verdict is not verified.'
        );
      }
    }
    const expectedPath = text(saveReceipt.expected_path);
    const coldTarget = text(coldReceipt.target_path);
    if (expectedPath && coldTarget && coldTarget !== expectedPath) {
      reason(
        'cold_readback_path_mismatch',
        'Cold readback ran against a different file than the saved canonical path.'
      );
    }
    if (coldReceipt.mode === 'fixture') {
      reason(
        'cold_readback_fixture_only',
        'Cold readback ran against a disposable fixture, not the canonical file.'
      );
    }
    const savedAt = parseTimestamp(
      saveReceipt.explicit_save?.acknowledged_at ?? saveReceipt.recorded_at
    );
    const coldAt = parseTimestamp(coldReceipt.recorded_at);
    if (savedAt && coldAt && coldAt.milliseconds < savedAt.milliseconds) {
      reason(
        'cold_readback_stale',
        'Cold readback predates the acknowledged save.'
      );
    }
  }

  return {
    schema: PEN_PROMOTION_GATE_SCHEMA,
    claim:
      reasons.length === 0 ? 'cold_round_trip_verified' : 'live_readback_only',
    reasons,
  };
}

export function exitCodeForPenPromotionClaim(evaluation) {
  return evaluation.claim === 'cold_round_trip_verified' ? 0 : 1;
}
