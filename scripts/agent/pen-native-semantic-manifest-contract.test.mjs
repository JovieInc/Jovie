import assert from 'node:assert/strict';
import test from 'node:test';

import {
  diffPenSemanticManifests,
  PEN_NATIVE_SEMANTIC_MANIFEST_SCHEMA,
  validatePenNativeSemanticManifestReceipt,
} from './pen-native-semantic-manifest-contract.mjs';

const PATH = '/workspace/canonical.pen';
const DIGEST = 'a'.repeat(64);

function receipt(overrides = {}) {
  const nodes = [
    {
      id: 'root',
      type: 'frame',
      name: 'Root',
      reusable: false,
      ref_id: null,
      child_ids: ['child'],
      properties_sha256: DIGEST,
    },
    {
      id: 'child',
      type: 'text',
      name: 'Headline',
      reusable: true,
      ref_id: 'component-1',
      child_ids: [],
      properties_sha256: 'b'.repeat(64),
    },
  ];
  return {
    schema: PEN_NATIVE_SEMANTIC_MANIFEST_SCHEMA,
    verdict: 'verified',
    inspection_method: 'pen-native-non-evaluating',
    source_path: PATH,
    source_byte_identity: DIGEST,
    canonical_manifest_sha256: 'c'.repeat(64),
    runtime_identity: 'Pen 1.2.4',
    build_identity: 'pen-native-inspector-test',
    execute_invoked: false,
    save_invoked: false,
    document_opened: false,
    output_document_created: false,
    direct_file_read: false,
    event_deltas: {
      document_modified: 0,
      file_changed: 0,
      save: 0,
      backup: 0,
      open: 0,
      switch: 0,
      output: 0,
    },
    semantic_manifest_complete: true,
    semantic_manifest: {
      root_ids: ['root'],
      root_count: 1,
      total_node_count: 2,
      reusable_count: 1,
      nodes,
    },
    ...overrides,
  };
}

test('accepts a complete native manifest and rejects incomplete traversal', () => {
  assert.deepEqual(
    validatePenNativeSemanticManifestReceipt(receipt(), { lockedExpectedPath: PATH }),
    { valid: true, errors: [] }
  );

  const truncated = receipt({
    semantic_manifest: {
      ...receipt().semantic_manifest,
      nodes: receipt().semantic_manifest.nodes.slice(0, 1),
      total_node_count: 1,
    },
  });
  const result = validatePenNativeSemanticManifestReceipt(truncated, {
    lockedExpectedPath: PATH,
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(error => error.code === 'child_id_missing'));
});

test('rejects activity, nonzero event deltas, and identity mismatches', () => {
  const result = validatePenNativeSemanticManifestReceipt(
    receipt({
      source_path: '/tmp/recovery.pen',
      direct_file_read: true,
      event_deltas: { ...receipt().event_deltas, backup: 1 },
    }),
    { lockedExpectedPath: PATH }
  );
  assert.equal(result.valid, false);
  assert.deepEqual(
    result.errors.map(error => error.code),
    ['source_path_mismatch', 'direct_file_read_invalid', 'event_delta_backup_invalid']
  );
});

test('semantic diff is deterministic and preserves unrelated IDs', () => {
  const left = receipt().semantic_manifest;
  const right = structuredClone(left);
  right.nodes[1] = { ...right.nodes[1], properties_sha256: 'd'.repeat(64) };
  assert.deepEqual(diffPenSemanticManifests(left, right), {
    added: [],
    removed: [],
    changed: ['child'],
  });
  assert.deepEqual(diffPenSemanticManifests(right, left), {
    added: [],
    removed: [],
    changed: ['child'],
  });
});
