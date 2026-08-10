import { isAbsolute } from 'node:path';

export const PEN_SAVE_RECEIPT_SCHEMA = 'pen-save-receipt/v1';

const editedTitlePattern = /(?:^|\s)[—-]?\s*Edited\s*$/i;
const sha256Pattern = /^[a-f0-9]{64}$/;
const explicitSaveMethods = new Set(['Cmd-S', 'editor-save', 'save-document']);

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function isPenPath(value) {
  return isAbsolute(value) && value.toLowerCase().endsWith('.pen');
}

function parseTimestamp(value) {
  const timestamp = text(value);
  const milliseconds = Date.parse(timestamp);
  return Number.isFinite(milliseconds) ? { timestamp, milliseconds } : null;
}

function evidenceDigest(evidence) {
  return sha256Pattern.test(evidence?.sha256 ?? '') ? evidence.sha256 : null;
}

export function isProtectedPenEvidencePath(
  path,
  resolvedPath,
  protectedPaths = []
) {
  const candidates = [path, resolvedPath].map(candidate =>
    candidate.toLowerCase()
  );
  const protectedCandidates = protectedPaths.map(candidate =>
    candidate.toLowerCase()
  );
  return (
    candidates.some(candidate => candidate.endsWith('.pen')) ||
    candidates.some(candidate => protectedCandidates.includes(candidate))
  );
}

export function matchesProtectedFileIdentity(stats, protectedIdentities = []) {
  return protectedIdentities.some(
    identity => identity.dev === stats.dev && identity.ino === stats.ino
  );
}

export function buildPenSaveReceipt(input = {}) {
  const workspaceProfile = text(input.workspaceProfile);
  const expectedPath = text(input.lockedExpectedPath);
  const activePathBefore = text(input.activePathBefore);
  const activePathAfter = text(input.activePathAfter);
  const documentTitle = text(input.documentTitle);
  const writer = text(input.writer);
  const batchId = text(input.batchId);
  const rootIds = [
    ...new Set(
      (Array.isArray(input.rootIds) ? input.rootIds : [])
        .map(text)
        .filter(Boolean)
    ),
  ];
  const batchStartedAt = parseTimestamp(input.batchStartedAt);
  const requestedAt = parseTimestamp(input.saveRequestedAt);
  const acknowledgedAt = parseTimestamp(input.saveAcknowledgedAt);
  const postReadbackAt = parseTimestamp(input.postReadbackAt);
  const recordedAt = parseTimestamp(input.recordedAt);
  const evidence = input.evidence ?? {};
  const blockers = [];

  const block = (code, message) => blockers.push({ code, message });

  if (!workspaceProfile)
    block('workspace_profile_missing', 'A workspace profile is required.');
  if (!isPenPath(expectedPath)) {
    block(
      'locked_path_invalid',
      'The workspace profile must resolve to an absolute .pen path.'
    );
  }
  if (!isPenPath(activePathBefore)) {
    block(
      'active_path_before_invalid',
      'Active path before mutation must be an absolute .pen path.'
    );
  } else if (expectedPath && activePathBefore !== expectedPath) {
    block(
      'path_mismatch_before',
      'Active path before mutation differs from the pinned file lock.'
    );
  }
  if (!isPenPath(activePathAfter)) {
    block(
      'active_path_after_invalid',
      'Active path after save must be an absolute .pen path.'
    );
  } else if (expectedPath && activePathAfter !== expectedPath) {
    block(
      'path_mismatch_after',
      'Active path after save differs from the pinned file lock.'
    );
  }
  if (!documentTitle) {
    block('document_title_missing', 'Observed document title is required.');
  } else if (editedTitlePattern.test(documentTitle)) {
    block(
      'document_title_edited',
      'Observed document title still reports Edited.'
    );
  }
  if (!writer)
    block('writer_missing', 'A coordinated active writer is required.');
  if (!batchId) block('batch_id_missing', 'A mutation batch ID is required.');
  if (rootIds.length === 0) {
    block('roots_missing', 'At least one post-save root ID is required.');
  }
  if (input.mutationState !== 'confirmed') {
    block(
      'mutation_unknown',
      'Mutation state must be confirmed; timeouts and disconnects are unknown.'
    );
  }
  if (input.saveAcknowledged !== true) {
    block('save_not_acknowledged', 'Explicit save acknowledgment is required.');
  }
  if (!explicitSaveMethods.has(input.saveMethod)) {
    block(
      'save_method_invalid',
      'Save method must be Cmd-S, editor-save, or save-document.'
    );
  }
  if (input.dirtyState !== 'clean') {
    block('dirty_or_unknown', 'Post-save dirty state must be clean.');
  }
  if (input.readbackVerified !== true) {
    block('readback_unverified', 'Post-save root readback must be verified.');
  }

  const chronology = [
    [
      'batch_started_at_invalid',
      'A valid batch start timestamp is required.',
      batchStartedAt,
    ],
    [
      'save_requested_at_invalid',
      'A valid save request timestamp is required.',
      requestedAt,
    ],
    [
      'save_acknowledged_at_invalid',
      'A valid save acknowledgment timestamp is required.',
      acknowledgedAt,
    ],
    [
      'post_readback_at_invalid',
      'A valid post-save readback timestamp is required.',
      postReadbackAt,
    ],
    [
      'recorded_at_invalid',
      'A valid receipt timestamp is required.',
      recordedAt,
    ],
  ];
  for (const [code, message, value] of chronology) {
    if (!value) block(code, message);
  }
  if (chronology.every(([, , value]) => value)) {
    const ordered = chronology.map(
      ([, , value]) => value?.milliseconds ?? Number.NaN
    );
    if (
      ordered.some((value, index) => index > 0 && value < ordered[index - 1])
    ) {
      block(
        'chronology_invalid',
        'Receipt timestamps must be ordered batch start, save request, save acknowledgment, readback, receipt.'
      );
    }
  }

  const evidenceRequirements = [
    [
      'preAppState',
      'pre_app_state_evidence_missing',
      'Pre-mutation app-state evidence is required.',
    ],
    [
      'postAppState',
      'post_app_state_evidence_missing',
      'Post-save app-state evidence is required.',
    ],
    [
      'windowState',
      'window_state_evidence_missing',
      'Post-save window-state evidence is required.',
    ],
    [
      'saveResponse',
      'save_response_evidence_missing',
      'Explicit save-response evidence is required.',
    ],
    [
      'readback',
      'readback_evidence_missing',
      'Post-save root-readback evidence is required.',
    ],
  ];
  for (const [key, code, message] of evidenceRequirements) {
    if (!evidenceDigest(evidence[key]) || !text(evidence[key]?.content))
      block(code, message);
  }
  if (
    expectedPath &&
    !text(evidence.preAppState?.content).includes(expectedPath)
  ) {
    block(
      'pre_app_state_path_unbound',
      'Pre-mutation app-state evidence does not contain the pinned path.'
    );
  }
  if (
    expectedPath &&
    !text(evidence.postAppState?.content).includes(expectedPath)
  ) {
    block(
      'post_app_state_path_unbound',
      'Post-save app-state evidence does not contain the pinned path.'
    );
  }
  if (
    documentTitle &&
    !text(evidence.windowState?.content).includes(documentTitle)
  ) {
    block(
      'window_title_unbound',
      'Window-state evidence does not contain the observed title.'
    );
  }
  if (
    !/(?:Cmd-S|editor-save|save-document|Received response: save)/.test(
      text(evidence.saveResponse?.content)
    )
  ) {
    block(
      'save_response_unbound',
      'Save evidence does not contain an explicit save acknowledgment.'
    );
  }
  for (const rootId of rootIds) {
    if (!text(evidence.readback?.content).includes(rootId)) {
      block(
        'readback_root_unbound',
        `Readback evidence does not contain root ${rootId}.`
      );
    }
  }

  return {
    schema: PEN_SAVE_RECEIPT_SCHEMA,
    workspace_profile: workspaceProfile || null,
    expected_path: expectedPath || null,
    active_path_before: activePathBefore || null,
    active_path_after: activePathAfter || null,
    document_title: documentTitle || null,
    writer: writer || null,
    mutation_batch_id: batchId || null,
    root_ids: rootIds,
    mutation_state: input.mutationState ?? 'unknown',
    explicit_save: {
      method: text(input.saveMethod) || null,
      requested_at: requestedAt?.timestamp ?? null,
      acknowledged_at: acknowledgedAt?.timestamp ?? null,
      acknowledged: input.saveAcknowledged === true,
    },
    dirty_state: input.dirtyState ?? 'unknown',
    post_save_readback_at: postReadbackAt?.timestamp ?? null,
    post_save_readback_verified: input.readbackVerified === true,
    batch_started_at: batchStartedAt?.timestamp ?? null,
    backup_path: text(input.backupPath) || null,
    evidence: Object.fromEntries(
      evidenceRequirements.map(([key]) => [
        `${key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`)}_sha256`,
        evidenceDigest(evidence[key]),
      ])
    ),
    recorded_at: recordedAt?.timestamp ?? null,
    verdict: blockers.length === 0 ? 'saved_state_verified' : 'blocked',
    durability: 'not_proven',
    blockers,
  };
}

export function exitCodeForPenSaveReceipt(receipt) {
  return receipt.verdict === 'saved_state_verified' ? 0 : 1;
}
