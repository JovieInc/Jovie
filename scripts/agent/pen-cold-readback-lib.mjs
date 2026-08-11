import { isAbsolute } from 'node:path';

import { validateSavedStateVerifiedReceipt } from './pen-save-receipt-lib.mjs';

export const PEN_COLD_READBACK_SCHEMA = 'pen-cold-readback/v2';
export const PEN_COLD_READBACK_LEGACY_SCHEMA = 'pen-cold-readback/v1';
export const PEN_PROMOTION_GATE_SCHEMA = 'pen-promotion-gate/v1';
export const PEN_SAVE_RECEIPT_SCHEMA_REF = 'pen-save-receipt/v1';
export const SAFE_COLD_MANIFEST_REASON = 'safe_cold_manifest_unavailable';

const unavailableMessage =
  'Pinned Pen runtime exposes no native non-evaluating complete semantic inspector; execute, document-open, and file-read fallbacks are prohibited.';
const desktopDirtyBlockers = new Set([
  'document_title_edited',
  'dirty_or_unknown',
]);
const MAX_COPIED_BLOCKERS = 32;
const MAX_REASON_CODE_LENGTH = 96;
const MAX_REASON_MESSAGE_LENGTH = 512;

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function parseTimestamp(value) {
  const timestamp = text(value);
  const milliseconds = Date.parse(timestamp);
  return Number.isFinite(milliseconds) ? { timestamp, milliseconds } : null;
}

function boundedText(value, maximumLength) {
  return text(value).slice(0, maximumLength);
}

/**
 * Builds the only truthful cold-readback receipt supported by the pinned Pen
 * runtime. Pen 1.2.4 and @pen.dev/cli 0.3.2 expose no native, non-evaluating,
 * complete semantic inspector, so this function always fails closed without
 * accepting partial evidence or claiming document durability.
 */
export function buildPenColdReadbackReceipt(input = {}) {
  const workspaceProfile = text(input.workspaceProfile);
  const targetPath = text(input.targetPath);
  const recordedAt = parseTimestamp(input.recordedAt);
  const executeInvoked = input.executeInvoked === true;
  const saveInvoked = input.saveInvoked === true;
  const documentOpened = input.documentOpened === true;
  const outputDocumentCreated = input.outputDocumentCreated === true;
  const blockers = [];
  const block = (code, message) => blockers.push({ code, message });

  if (!workspaceProfile) {
    block('workspace_profile_missing', 'A workspace profile is required.');
  }
  if (!isAbsolute(targetPath) || !targetPath.toLowerCase().endsWith('.pen')) {
    block(
      'target_path_invalid',
      'Target must be an absolute .pen path supplied by the pinned workspace profile.'
    );
  }
  if (!recordedAt) {
    block('recorded_at_invalid', 'A valid receipt timestamp is required.');
  }
  const forbiddenActivity =
    executeInvoked || saveInvoked || documentOpened || outputDocumentCreated;
  if (forbiddenActivity) {
    block(
      'forbidden_cold_readback_activity',
      'Cold-manifest unavailability must be reported before execute, save, document open, or output creation.'
    );
  }

  if (!forbiddenActivity) {
    blockers.unshift({
      code: SAFE_COLD_MANIFEST_REASON,
      message: unavailableMessage,
    });
  }

  return {
    schema: PEN_COLD_READBACK_SCHEMA,
    mode: 'canonical',
    workspace_profile: workspaceProfile || null,
    target_path: targetPath || null,
    verdict: forbiddenActivity ? 'error' : 'cold_readback_failed',
    typed_reasons: [
      forbiddenActivity
        ? 'forbidden_cold_readback_activity'
        : SAFE_COLD_MANIFEST_REASON,
    ],
    semantic_manifest: null,
    semantic_manifest_complete: false,
    inspection_method: null,
    execute_invoked: executeInvoked,
    save_invoked: saveInvoked,
    document_opened: documentOpened,
    output_document_created: outputDocumentCreated,
    recorded_at: recordedAt?.timestamp ?? null,
    durability: 'not_proven',
    exit_code: forbiddenActivity ? 2 : 1,
    blockers,
  };
}

export function exitCodeForPenColdReadback(receipt) {
  return receipt?.exit_code === 1 ? 1 : 2;
}

/**
 * Returns the strongest truthful promotion claim available today. A valid save
 * receipt can establish live readback only. No cold-round-trip claim is
 * possible until a separately reviewed native inspector contract exists.
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
    return {
      schema: PEN_PROMOTION_GATE_SCHEMA,
      claim: 'unverified',
      reasons,
    };
  }
  if (!Array.isArray(saveReceipt.blockers)) {
    reason(
      'save_receipt_invalid',
      'Save receipt blockers must be an explicit array.'
    );
    return {
      schema: PEN_PROMOTION_GATE_SCHEMA,
      claim: 'unverified',
      reasons,
    };
  }
  const saveBlockers = saveReceipt.blockers;
  if (
    saveReceipt.verdict !== 'saved_state_verified' ||
    saveBlockers.length > 0
  ) {
    for (const blocker of saveBlockers.slice(0, MAX_COPIED_BLOCKERS)) {
      const blockerCode = boundedText(blocker?.code, MAX_REASON_CODE_LENGTH);
      const blockerMessage = boundedText(
        blocker?.message,
        MAX_REASON_MESSAGE_LENGTH
      );
      if (desktopDirtyBlockers.has(blockerCode)) {
        reason(
          'desktop_dirty_after_save',
          'The desktop remained dirty after the claimed save.'
        );
      } else {
        reason(blockerCode || 'save_receipt_blocked', blockerMessage);
      }
    }
    if (saveBlockers.length > MAX_COPIED_BLOCKERS) {
      reason(
        'save_receipt_blockers_truncated',
        `Only the first ${MAX_COPIED_BLOCKERS} save blockers were copied.`
      );
    }
    if (saveBlockers.length === 0) {
      reason('save_receipt_blocked', 'Save receipt verdict is not verified.');
    }
    return {
      schema: PEN_PROMOTION_GATE_SCHEMA,
      claim: 'unverified',
      reasons,
    };
  }

  const saveValidation = validateSavedStateVerifiedReceipt(saveReceipt, {
    lockedExpectedPath: input.lockedExpectedPath,
  });
  if (!saveValidation.valid) {
    reason(
      'save_receipt_invalid',
      `Save receipt failed required output checks: ${saveValidation.errors
        .map(error => error.code)
        .join(', ')}`
    );
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
  } else if (coldReceipt.schema === PEN_COLD_READBACK_LEGACY_SCHEMA) {
    reason(
      'partial_component_evidence',
      'pen-cold-readback/v1 used an evaluating component probe and cannot support a cold claim.'
    );
  } else if (coldReceipt.schema !== PEN_COLD_READBACK_SCHEMA) {
    reason(
      'cold_readback_receipt_invalid',
      'Cold-readback receipt schema is not pen-cold-readback/v2.'
    );
  } else {
    const receiptReasons = Array.isArray(coldReceipt.typed_reasons)
      ? coldReceipt.typed_reasons.map(text).filter(Boolean)
      : [];
    if (receiptReasons.includes(SAFE_COLD_MANIFEST_REASON)) {
      reason(SAFE_COLD_MANIFEST_REASON, unavailableMessage);
    } else {
      reason(
        SAFE_COLD_MANIFEST_REASON,
        'No reviewed native inspector exists, so a cold-readback receipt cannot support promotion.'
      );
    }

    const expectedPath = text(saveReceipt.expected_path);
    const coldTarget = text(coldReceipt.target_path);
    if (expectedPath && coldTarget && coldTarget !== expectedPath) {
      reason(
        'cold_readback_path_mismatch',
        'Cold readback targeted a different path than the saved canonical path.'
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
    claim: 'live_readback_only',
    reasons,
  };
}

export function exitCodeForPenPromotionClaim(evaluation) {
  return evaluation.claim === 'cold_round_trip_verified' ? 0 : 1;
}
