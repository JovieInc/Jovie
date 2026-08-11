import { isAbsolute } from 'node:path';

export const PEN_NATIVE_SEMANTIC_MANIFEST_SCHEMA =
  'pen-native-semantic-manifest/v1';

const SHA256 = /^[a-f0-9]{64}$/;

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function record(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function penPath(value) {
  return isAbsolute(value) && value.toLowerCase().endsWith('.pen');
}

function digest(value) {
  return SHA256.test(value ?? '');
}

function add(errors, code, message) {
  errors.push({ code, message });
}

/**
 * Validate the receipt emitted by a separately reviewed Pen-native inspector.
 * This function never reads a document or computes a digest from document
 * bytes. It only validates facts produced inside Pen.
 */
export function validatePenNativeSemanticManifestReceipt(
  receipt,
  options = {}
) {
  const errors = [];
  if (!record(receipt)) {
    return {
      valid: false,
      errors: [
        { code: 'receipt_not_object', message: 'Receipt must be JSON.' },
      ],
    };
  }

  if (receipt.schema !== PEN_NATIVE_SEMANTIC_MANIFEST_SCHEMA) {
    add(
      errors,
      'schema_invalid',
      `Receipt schema must be ${PEN_NATIVE_SEMANTIC_MANIFEST_SCHEMA}.`
    );
  }
  if (receipt.verdict !== 'verified')
    add(errors, 'verdict_invalid', 'Receipt verdict must be verified.');
  if (receipt.semantic_manifest_complete !== true)
    add(errors, 'manifest_incomplete', 'Manifest must be complete.');
  if (receipt.inspection_method !== 'pen-native-non-evaluating')
    add(
      errors,
      'inspection_method_invalid',
      'Inspection must be Pen-native and non-evaluating.'
    );

  const sourcePath = text(receipt.source_path);
  const expectedPath = text(options.expectedPath ?? options.lockedExpectedPath);
  if (!penPath(sourcePath))
    add(
      errors,
      'source_path_invalid',
      'Source path must be an absolute .pen path.'
    );
  if (expectedPath && sourcePath !== expectedPath)
    add(
      errors,
      'source_path_mismatch',
      'Source path differs from the locked path.'
    );

  for (const field of ['source_byte_identity', 'canonical_manifest_sha256']) {
    if (!digest(receipt[field]))
      add(
        errors,
        `${field}_invalid`,
        `${field} must be a lowercase SHA-256 digest.`
      );
  }
  for (const field of ['runtime_identity', 'build_identity']) {
    if (!text(receipt[field]))
      add(errors, `${field}_missing`, `${field} is required.`);
  }

  for (const field of [
    'execute_invoked',
    'save_invoked',
    'document_opened',
    'output_document_created',
    'direct_file_read',
  ]) {
    if (receipt[field] !== false)
      add(errors, `${field}_invalid`, `${field} must be false.`);
  }

  const deltas = receipt.event_deltas;
  if (!record(deltas)) {
    add(errors, 'event_deltas_invalid', 'Event deltas are required.');
  } else {
    for (const field of [
      'document_modified',
      'file_changed',
      'save',
      'backup',
      'open',
      'switch',
      'output',
    ]) {
      if (deltas[field] !== 0)
        add(
          errors,
          `event_delta_${field}_invalid`,
          `${field} delta must be zero.`
        );
    }
  }

  const manifest = receipt.semantic_manifest;
  if (!record(manifest)) {
    add(errors, 'manifest_invalid', 'Semantic manifest is required.');
    return { valid: errors.length === 0, errors };
  }
  const nodes = manifest.nodes;
  const roots = manifest.root_ids;
  if (!Array.isArray(nodes) || !Array.isArray(roots)) {
    add(
      errors,
      'manifest_graph_invalid',
      'Manifest must contain nodes and root_ids arrays.'
    );
    return { valid: false, errors };
  }
  const byId = new Map();
  for (const node of nodes) {
    const id = text(node?.id);
    if (!record(node) || !id || byId.has(id)) {
      add(
        errors,
        'node_identity_invalid',
        'Every node must have a unique non-empty ID.'
      );
      continue;
    }
    byId.set(id, node);
    if (!text(node.type) || !text(node.name))
      add(errors, 'node_shape_invalid', 'Every node requires type and name.');
    if (typeof node.reusable !== 'boolean')
      add(
        errors,
        'node_reusable_invalid',
        'Every node requires a reusable boolean.'
      );
    if (node.ref_id !== null && node.ref_id !== undefined && !text(node.ref_id))
      add(errors, 'node_ref_invalid', 'ref_id must be null or a non-empty ID.');
    if (!digest(node.properties_sha256))
      add(
        errors,
        'node_properties_digest_invalid',
        'Every node requires a properties SHA-256 digest.'
      );
    if (
      !Array.isArray(node.child_ids) ||
      new Set(node.child_ids).size !== node.child_ids.length
    )
      add(
        errors,
        'node_children_invalid',
        'Every node requires unique ordered child_ids.'
      );
  }
  if (
    new Set(roots).size !== roots.length ||
    roots.some(root => !byId.has(root))
  )
    add(
      errors,
      'root_ids_invalid',
      'Root IDs must be unique and refer to nodes.'
    );

  const reachable = new Set();
  const visiting = new Set();
  const visit = id => {
    if (visiting.has(id)) {
      add(errors, 'node_cycle', 'Manifest graph must not contain cycles.');
      return;
    }
    if (reachable.has(id)) return;
    const node = byId.get(id);
    if (!node) return;
    visiting.add(id);
    reachable.add(id);
    for (const childId of node.child_ids ?? []) {
      if (!byId.has(childId))
        add(errors, 'child_id_missing', 'Every child ID must refer to a node.');
      else visit(childId);
    }
    visiting.delete(id);
  };
  roots.forEach(visit);
  if (reachable.size !== nodes.length)
    add(
      errors,
      'manifest_truncated',
      'Every node must be reachable from a root.'
    );
  if (manifest.root_count !== roots.length)
    add(errors, 'root_count_invalid', 'root_count must equal root_ids length.');
  if (manifest.total_node_count !== nodes.length)
    add(
      errors,
      'total_node_count_invalid',
      'total_node_count must equal node count.'
    );
  const reusableCount = nodes.filter(node => node.reusable === true).length;
  if (manifest.reusable_count !== reusableCount)
    add(
      errors,
      'reusable_count_invalid',
      'reusable_count must match reusable nodes.'
    );

  return { valid: errors.length === 0, errors };
}

/** Produce a stable semantic diff without accessing either source artifact. */
export function diffPenSemanticManifests(left, right) {
  const leftNodes = new Map((left?.nodes ?? []).map(node => [node.id, node]));
  const rightNodes = new Map((right?.nodes ?? []).map(node => [node.id, node]));
  const added = [...rightNodes.keys()].filter(id => !leftNodes.has(id)).sort();
  const removed = [...leftNodes.keys()]
    .filter(id => !rightNodes.has(id))
    .sort();
  const changed = [...leftNodes.keys()]
    .filter(id => rightNodes.has(id))
    .filter(
      id =>
        leftNodes.get(id).properties_sha256 !==
        rightNodes.get(id).properties_sha256
    )
    .sort();
  return { added, removed, changed };
}
