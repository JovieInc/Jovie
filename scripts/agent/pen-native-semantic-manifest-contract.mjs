import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PEN_NATIVE_SEMANTIC_MANIFEST_SCHEMA =
  'pen-native-semantic-manifest/v1';

const SHA256 = /^[a-f0-9]{64}$/;
const HERE = dirname(fileURLToPath(import.meta.url));
const PROFILE_PATH = join(HERE, 'pen-workspace-locks.json');

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

function identifierList(value) {
  if (!Array.isArray(value) || value.length === 0) return null;
  const identifiers = value.map(text);
  if (
    identifiers.some(identifier => !identifier) ||
    new Set(identifiers).size !== identifiers.length
  ) {
    return null;
  }
  return identifiers;
}

function resolveWorkspaceAuthority(profileName) {
  const name = text(profileName);
  if (!name) {
    return {
      error: 'workspace_profile_missing',
      message: 'A versioned workspace profile is required.',
    };
  }

  let locks;
  try {
    locks = JSON.parse(readFileSync(PROFILE_PATH, 'utf8'));
  } catch {
    return {
      error: 'workspace_authority_unavailable',
      message: 'The versioned workspace authority could not be loaded.',
    };
  }

  const profile = locks?.profiles?.[name];
  if (!record(profile)) {
    return {
      error: 'workspace_profile_unknown',
      message: 'The workspace profile is not registered.',
    };
  }

  const authority = profile.native_semantic_manifest_authority;
  const expectedPath = text(authority?.expected_source_path);
  const expectedNodeIds = identifierList(authority?.node_ids);
  const expectedRootIds = identifierList(authority?.root_ids);
  if (
    !record(authority) ||
    authority.status !== 'available' ||
    !penPath(expectedPath) ||
    !expectedNodeIds ||
    !expectedRootIds
  ) {
    return {
      error: 'workspace_authority_unavailable',
      message:
        'The versioned profile has no reviewed complete semantic-manifest authority.',
    };
  }

  return { expectedPath, expectedNodeIds, expectedRootIds };
}

function canonicalNode(node) {
  const childIds = identifierList(node?.child_ids);
  const normalizedChildren =
    Array.isArray(node?.child_ids) && node.child_ids.length === 0
      ? []
      : childIds;
  if (
    !record(node) ||
    !text(node.id) ||
    !text(node.type) ||
    !text(node.name) ||
    typeof node.reusable !== 'boolean' ||
    (node.ref_id !== null && node.ref_id !== undefined && !text(node.ref_id)) ||
    !digest(node.properties_sha256) ||
    !normalizedChildren
  ) {
    return null;
  }
  return {
    id: text(node.id),
    type: text(node.type),
    name: text(node.name),
    reusable: node.reusable,
    ref_id:
      node.ref_id === null || node.ref_id === undefined
        ? null
        : text(node.ref_id),
    child_ids: normalizedChildren,
    properties_sha256: node.properties_sha256,
  };
}

function canonicalManifest(manifest) {
  const rootIds = identifierList(manifest?.root_ids);
  if (!record(manifest) || !rootIds || !Array.isArray(manifest.nodes)) {
    return null;
  }
  const nodes = manifest.nodes.map(canonicalNode);
  if (nodes.length === 0 || nodes.some(node => !node)) return null;
  return {
    root_ids: rootIds,
    root_count: manifest.root_count,
    total_node_count: manifest.total_node_count,
    reusable_count: manifest.reusable_count,
    nodes: nodes
      .map(node => node)
      .sort((left, right) => left.id.localeCompare(right.id)),
  };
}

export function hashPenSemanticManifest(manifest) {
  const canonical = canonicalManifest(manifest);
  if (!canonical) return null;
  return createHash('sha256')
    .update(JSON.stringify(canonical), 'utf8')
    .digest('hex');
}

/**
 * Validate the receipt emitted by a separately reviewed Pen-native inspector.
 * This function never reads a document or computes a digest from document
 * bytes. It only validates facts produced inside Pen.
 */
export function validatePenNativeSemanticManifestReceipt(receipt) {
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

  const authority = resolveWorkspaceAuthority(receipt.workspace_profile);
  if (authority.error) add(errors, authority.error, authority.message);

  const sourcePath = text(receipt.source_path);
  const expectedPath = text(authority.expectedPath);
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
  if (nodes.length === 0 || roots.length === 0) {
    add(
      errors,
      'manifest_empty',
      'A complete manifest must contain at least one root and one node.'
    );
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
    if (!Array.isArray(node.child_ids)) {
      add(
        errors,
        'node_children_invalid',
        'Every node requires unique ordered child_ids.'
      );
    } else if (
      node.child_ids.some(childId => !text(childId)) ||
      new Set(node.child_ids.map(text)).size !== node.child_ids.length
    ) {
      add(
        errors,
        'node_children_invalid',
        'Every child ID must be non-empty and unique.'
      );
    }
  }
  if (
    new Set(roots).size !== roots.length ||
    roots.some(root => !text(root)) ||
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
    const childIds = Array.isArray(node.child_ids) ? node.child_ids : [];
    for (const childId of childIds) {
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

  const expectedNodeIds = authority.expectedNodeIds;
  if (expectedNodeIds) {
    const actualNodeIds = [...byId.keys()].sort();
    const lockedNodeIds = [...expectedNodeIds].sort();
    if (JSON.stringify(actualNodeIds) !== JSON.stringify(lockedNodeIds)) {
      add(
        errors,
        'locked_node_ids_mismatch',
        'Manifest node IDs differ from the trusted complete inventory.'
      );
    }
  }

  const expectedRootIds = authority.expectedRootIds;
  if (
    expectedRootIds &&
    JSON.stringify(roots.map(text)) !== JSON.stringify(expectedRootIds)
  ) {
    add(
      errors,
      'locked_root_ids_mismatch',
      'Manifest root IDs or root order differ from the trusted inventory.'
    );
  }

  const computedManifestSha256 = hashPenSemanticManifest(manifest);
  if (
    computedManifestSha256 &&
    receipt.canonical_manifest_sha256 !== computedManifestSha256
  ) {
    add(
      errors,
      'canonical_manifest_digest_mismatch',
      'Canonical manifest digest does not bind the normalized semantic manifest.'
    );
  }

  return { valid: errors.length === 0, errors };
}

/** Produce a stable semantic diff without accessing either source artifact. */
export function diffPenSemanticManifests(left, right) {
  const leftCanonical = canonicalManifest(left);
  const rightCanonical = canonicalManifest(right);
  if (!leftCanonical || !rightCanonical) {
    return {
      valid: false,
      typed_reasons: ['manifest_invalid'],
      added: [],
      removed: [],
      changed: [],
      roots_changed: false,
    };
  }
  const leftNodes = new Map(
    leftCanonical.nodes.map(node => [node.id, JSON.stringify(node)])
  );
  const rightNodes = new Map(
    rightCanonical.nodes.map(node => [node.id, JSON.stringify(node)])
  );
  const added = [...rightNodes.keys()].filter(id => !leftNodes.has(id)).sort();
  const removed = [...leftNodes.keys()]
    .filter(id => !rightNodes.has(id))
    .sort();
  const changed = [...leftNodes.keys()]
    .filter(id => rightNodes.has(id))
    .filter(id => leftNodes.get(id) !== rightNodes.get(id))
    .sort();
  return {
    valid: true,
    added,
    removed,
    changed,
    roots_changed:
      JSON.stringify(leftCanonical.root_ids) !==
      JSON.stringify(rightCanonical.root_ids),
  };
}
