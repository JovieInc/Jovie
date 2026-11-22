#!/usr/bin/env node
/**
 * Accepted Pen drafts, carried into certification without a Mac.
 *
 * The canonical workspace behind PEN_GOLDEN_PATH_FILE_URL is read-only to
 * CI, so a draft Tim approves has no node in it and pen.design-exists keeps
 * failing. Promoting a draft copies its new top-level frame out of the
 * pen-draft-<frame>.pen artifact into docs/design-system/pen-accepted/
 * <frame>.json and points the Golden Path manifest entry at it. At export
 * time pen-golden-path.mjs splices every accepted frame into its download.
 *
 * The canonical file always wins: when it already holds a node with the
 * accepted frame's id, the overlay is skipped, and a difference between the
 * two is logged, so a stale overlay can never mask a later canonical edit.
 *
 *   node scripts/design/pen-accepted.mjs --promote --frame claim \
 *     --draft DIR/claim.pen --canonical canonical.pen --section claim/claim
 */
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { PEN_NODE_ID } from './bind-golden-path-nodes.mjs';

export const ACCEPTED_DIR = 'docs/design-system/pen-accepted';
export const ACCEPTED_SCHEMA = 'pen-accepted/v1';
export const GOLDEN_PATH_MANIFEST = 'docs/pen-stills/golden-path/manifest.json';
// The repo is close to its size budget; one frame should be well under this.
export const MAX_ACCEPTED_BYTES = 3 * 1024 * 1024;
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function walk(node, visit) {
  if (!node || typeof node !== 'object') return;
  visit(node);
  for (const child of node.children ?? []) walk(child, visit);
}

function nodeById(doc, id) {
  let hit = null;
  for (const top of doc?.children ?? [])
    walk(top, n => {
      if (!hit && n.id === id) hit = n;
    });
  return hit;
}

/**
 * The node a still exports: the drafted frame itself when it is as wide as
 * the manifest viewport, else its first descendant frame of that width
 * (drafts often hold desktop and mobile side by side), else the frame.
 */
export function stillNode(frame, viewport) {
  if (Number(frame?.width) === viewport) return frame;
  let hit = null;
  for (const child of frame?.children ?? [])
    walk(child, n => {
      if (!hit && n.type === 'frame' && Number(n.width) === viewport) hit = n;
    });
  return hit ?? frame;
}

/** The entries of `extra` whose keys `base` lacks, or undefined if none. */
function added(base, extra) {
  const out = Object.fromEntries(
    Object.entries(extra ?? {}).filter(([k]) => !(k in (base ?? {})))
  );
  return Object.keys(out).length ? out : undefined;
}

/**
 * The accepted record for one draft: its last top-level frame named after
 * the brief (the one pen-draft.mjs checks it added), and only the variables
 * and themes the draft added to the canonical it started from.
 */
export function extractAccepted(
  draft,
  frame,
  { viewport, sectionId, source, canonical }
) {
  const named = (draft?.children ?? []).filter(n => n?.name === frame);
  const node = named.at(-1);
  if (!node?.id) throw new Error(`draft has no top-level frame named ${frame}`);
  const still = stillNode(node, viewport);
  const record = {
    schema: ACCEPTED_SCHEMA,
    frame,
    sectionId,
    stillNodeId: still.id,
    viewport,
    source: source ?? null,
    node,
  };
  const variables = added(canonical?.variables, draft.variables);
  const themes = added(canonical?.themes, draft.themes);
  if (variables) record.variables = variables;
  if (themes) record.themes = themes;
  return record;
}

/** Every accepted record in DIR, in file-name order. */
export function loadAccepted(dir = join(REPO_ROOT, ACCEPTED_DIR)) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter(name => name.endsWith('.json'))
    .sort()
    .map(name => JSON.parse(readFileSync(join(dir, name), 'utf8')))
    .filter(record => record?.schema === ACCEPTED_SCHEMA && record.node?.id);
}

/**
 * The canonical document with each accepted frame the canonical lacks,
 * placed right of every existing frame. Canonical nodes, variables and
 * themes are never replaced. Returns what was applied and what was skipped.
 */
export function applyAccepted(doc, records, log = () => {}) {
  const applied = [];
  const skipped = [];
  const children = [...(doc.children ?? [])];
  let right = Math.max(
    0,
    ...children.map(c => (Number(c?.x) || 0) + (Number(c?.width) || 0))
  );
  const merge = (base, extra) =>
    base || extra ? { ...(extra ?? {}), ...(base ?? {}) } : undefined;
  let variables = doc.variables;
  let themes = doc.themes;
  for (const record of records) {
    const existing = nodeById(doc, record.node.id);
    if (existing) {
      const same = JSON.stringify(existing) === JSON.stringify(record.node);
      if (!same)
        log(
          `pen-accepted: canonical ${record.frame} (${record.node.id}) differs from the accepted overlay; using canonical`
        );
      skipped.push({
        frame: record.frame,
        reason: same ? 'same' : 'canonical-differs',
      });
      continue;
    }
    const ids = new Set();
    for (const top of children) walk(top, n => ids.add(n.id));
    walk(record.node, n => ids.add(n.id));
    const dangling = new Set();
    walk(record.node, n => {
      if (typeof n.ref === 'string' && !ids.has(n.ref)) dangling.add(n.ref);
    });
    if (dangling.size)
      log(
        `pen-accepted: ${record.frame} refers to ${dangling.size} node(s) the canonical lacks: ${[...dangling].slice(0, 5).join(', ')}`
      );
    children.push({ ...record.node, x: right + 400 });
    right += 400 + (Number(record.node.width) || 0);
    variables = merge(variables, record.variables);
    themes = merge(themes, record.themes);
    applied.push(record.frame);
  }
  const out = { ...doc, children };
  if (variables) out.variables = variables;
  if (themes) out.themes = themes;
  return { doc: out, applied, skipped };
}

/** The manifest with one section pointed at its accepted still node. */
export function pointManifest(manifest, sectionId, nodeId) {
  const frame = manifest.frames?.find(f => f.sectionId === sectionId);
  if (!frame) throw new Error(`manifest has no section ${sectionId}`);
  if (!PEN_NODE_ID.test(String(nodeId)))
    throw new Error(`${nodeId} is not a Pen node id`);
  frame.penNodeId = nodeId;
  return manifest;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({
    options: {
      promote: { type: 'boolean' },
      frame: { type: 'string' },
      draft: { type: 'string' },
      section: { type: 'string' },
      source: { type: 'string' },
      canonical: { type: 'string' },
    },
  });
  const required = ['frame', 'draft', 'canonical', 'section'];
  if (!values.promote || required.some(k => !values[k])) {
    process.stderr.write(
      'usage: pen-accepted.mjs --promote --frame NAME --draft FILE.pen --canonical FILE.pen --section SECTION_ID [--source URL]\n'
    );
    process.exit(64);
  }
  const manifestPath = join(REPO_ROOT, GOLDEN_PATH_MANIFEST);
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const entry = manifest.frames.find(f => f.sectionId === values.section);
  if (!entry) throw new Error(`manifest has no section ${values.section}`);
  const draft = JSON.parse(readFileSync(values.draft, 'utf8'));
  const record = extractAccepted(draft, values.frame, {
    viewport: entry.viewport,
    sectionId: values.section,
    source: values.source,
    canonical: JSON.parse(readFileSync(values.canonical, 'utf8')),
  });
  const body = `${JSON.stringify(record)}\n`;
  if (Buffer.byteLength(body) > MAX_ACCEPTED_BYTES)
    throw new Error(
      `accepted ${values.frame} is ${Buffer.byteLength(body)} bytes, over ${MAX_ACCEPTED_BYTES}`
    );
  mkdirSync(join(REPO_ROOT, ACCEPTED_DIR), { recursive: true });
  writeFileSync(join(REPO_ROOT, ACCEPTED_DIR, `${values.frame}.json`), body);
  pointManifest(manifest, values.section, record.stillNodeId);
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  process.stdout.write(
    `accepted ${values.frame}: ${values.section} -> ${record.stillNodeId} (${Buffer.byteLength(body)} bytes)\n`
  );
}
