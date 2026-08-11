import assert from 'node:assert/strict';
import test from 'node:test';

import {
  diffPenSemanticManifests,
  hashPenSemanticManifest,
  PEN_NATIVE_SEMANTIC_MANIFEST_SCHEMA,
  validatePenNativeSemanticManifestReceipt,
} from './pen-native-semantic-manifest-contract.mjs';

const PATH = '/workspace/canonical.pen';
const DIGEST = 'a'.repeat(64);
const LOCKED_OPTIONS = {
  lockedExpectedPath: PATH,
  lockedExpectedNodeIds: ['root', 'child'],
  lockedExpectedRootIds: ['root'],
};

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
  const result = {
    schema: PEN_NATIVE_SEMANTIC_MANIFEST_SCHEMA,
    verdict: 'verified',
    inspection_method: 'pen-native-non-evaluating',
    source_path: PATH,
    source_byte_identity: DIGEST,
    canonical_manifest_sha256: null,
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
  if (!Object.hasOwn(overrides, 'canonical_manifest_sha256')) {
    result.canonical_manifest_sha256 = hashPenSemanticManifest(
      result.semantic_manifest
    );
  }
  return result;
}

test('accepts a complete native manifest and rejects incomplete traversal', () => {
  assert.deepEqual(
    validatePenNativeSemanticManifestReceipt(receipt(), LOCKED_OPTIONS),
    { valid: true, errors: [] }
  );

  const truncated = receipt({
    semantic_manifest: {
      ...receipt().semantic_manifest,
      nodes: receipt().semantic_manifest.nodes.slice(0, 1),
      total_node_count: 1,
    },
  });
  const result = validatePenNativeSemanticManifestReceipt(
    truncated,
    LOCKED_OPTIONS
  );
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(error => error.code === 'child_id_missing'));

  const selfConsistentOmission = receipt({
    semantic_manifest: {
      root_ids: ['root'],
      root_count: 1,
      total_node_count: 1,
      reusable_count: 0,
      nodes: [
        {
          ...receipt().semantic_manifest.nodes[0],
          child_ids: [],
        },
      ],
    },
  });
  const omissionResult = validatePenNativeSemanticManifestReceipt(
    selfConsistentOmission,
    LOCKED_OPTIONS
  );
  assert.equal(omissionResult.valid, false);
  assert.ok(
    omissionResult.errors.some(
      error => error.code === 'locked_node_ids_mismatch'
    )
  );

  const emptyManifest = receipt({
    semantic_manifest: {
      root_ids: [],
      root_count: 0,
      total_node_count: 0,
      reusable_count: 0,
      nodes: [],
    },
  });
  const emptyResult = validatePenNativeSemanticManifestReceipt(
    emptyManifest,
    LOCKED_OPTIONS
  );
  assert.equal(emptyResult.valid, false);
  assert.ok(emptyResult.errors.some(error => error.code === 'manifest_empty'));
});

test('rejects activity, nonzero event deltas, and identity mismatches', () => {
  const result = validatePenNativeSemanticManifestReceipt(
    receipt({
      source_path: '/tmp/recovery.pen',
      direct_file_read: true,
      event_deltas: { ...receipt().event_deltas, backup: 1 },
    }),
    LOCKED_OPTIONS
  );
  assert.equal(result.valid, false);
  assert.deepEqual(
    result.errors.map(error => error.code),
    [
      'source_path_mismatch',
      'direct_file_read_invalid',
      'event_delta_backup_invalid',
    ]
  );
});

test('requires locked authority, binds the digest, and never throws on malformed children', () => {
  const unlocked = validatePenNativeSemanticManifestReceipt(receipt());
  assert.equal(unlocked.valid, false);
  assert.ok(
    unlocked.errors.some(error => error.code === 'locked_expected_path_missing')
  );

  const forgedDigest = validatePenNativeSemanticManifestReceipt(
    receipt({ canonical_manifest_sha256: 'f'.repeat(64) }),
    LOCKED_OPTIONS
  );
  assert.equal(forgedDigest.valid, false);
  assert.ok(
    forgedDigest.errors.some(
      error => error.code === 'canonical_manifest_digest_mismatch'
    )
  );

  const malformed = receipt();
  malformed.semantic_manifest.nodes[0].child_ids = {};
  assert.doesNotThrow(() =>
    validatePenNativeSemanticManifestReceipt(malformed, LOCKED_OPTIONS)
  );
  const malformedResult = validatePenNativeSemanticManifestReceipt(
    malformed,
    LOCKED_OPTIONS
  );
  assert.equal(malformedResult.valid, false);
  assert.ok(
    malformedResult.errors.some(error => error.code === 'node_children_invalid')
  );
});

test('semantic diff is deterministic and preserves unrelated IDs', () => {
  const left = receipt().semantic_manifest;
  const right = structuredClone(left);
  right.root_ids = ['child', 'root'];
  right.root_count = 2;
  right.nodes[1] = {
    ...right.nodes[1],
    type: 'frame',
    name: 'Changed',
    reusable: false,
    ref_id: 'component-2',
    child_ids: ['root'],
    properties_sha256: 'd'.repeat(64),
  };
  assert.deepEqual(diffPenSemanticManifests(left, right), {
    valid: true,
    added: [],
    removed: [],
    changed: ['child'],
    roots_changed: true,
  });
  assert.deepEqual(diffPenSemanticManifests(right, left), {
    valid: true,
    added: [],
    removed: [],
    changed: ['child'],
    roots_changed: true,
  });
});
