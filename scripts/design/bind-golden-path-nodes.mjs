#!/usr/bin/env node
/**
 * Bind real Pen node ids into docs/pen-stills/golden-path/manifest.json.
 *
 * Fail-closed: never invent ids. Rejects pending-*, empty, or non-Pen-shaped
 * tokens. Use after Tim authors frames on jovie-founder-design-studio.
 *
 *   node scripts/design/bind-golden-path-nodes.mjs \
 *     --set landing/homepage=<id> --set claim/claim=<id> \
 *     --set checkout/billing-success=<id> [--dry-run]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const MANIFEST = 'docs/pen-stills/golden-path/manifest.json';
export const BIND_SECTIONS = Object.freeze([
  'landing/homepage',
  'claim/claim',
  'checkout/billing-success',
]);

/** Pen frame ids in this repo are short alphanumeric (e.g. D9kdx, hGHPE). */
export const PEN_NODE_ID = /^[A-Za-z0-9]{4,12}$/;

export function parseSetArgs(argv) {
  const sets = new Map();
  let dryRun = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') dryRun = true;
    else if (a === '--set') {
      const raw = argv[++i] ?? '';
      const eq = raw.indexOf('=');
      if (eq < 1)
        throw new Error(`--set needs sectionId=penNodeId, got ${raw}`);
      sets.set(raw.slice(0, eq), raw.slice(eq + 1));
    } else throw new Error(`unknown arg ${a}`);
  }
  return { sets, dryRun };
}

export function validateNodeId(id) {
  const v = String(id ?? '').trim();
  if (!v) return 'empty penNodeId';
  if (v.startsWith('pending')) return `refuses pending id ${v}`;
  if (!PEN_NODE_ID.test(v)) return `invalid penNodeId shape ${v}`;
  return null;
}

export function applyBindings(manifest, sets) {
  const blockers = [];
  const applied = [];
  const frames = Array.isArray(manifest?.frames) ? manifest.frames : null;
  if (!frames) {
    blockers.push({ code: 'manifest_frames', message: 'frames[] required' });
    return { ok: false, blockers, applied, manifest };
  }
  for (const [sectionId, penNodeId] of sets) {
    if (!BIND_SECTIONS.includes(sectionId)) {
      blockers.push({
        code: 'section_not_allowed',
        message: `${sectionId} not in DES-21 bind allowlist`,
      });
      continue;
    }
    const bad = validateNodeId(penNodeId);
    if (bad) {
      blockers.push({ code: 'pen_node_id', message: `${sectionId}: ${bad}` });
      continue;
    }
    const frame = frames.find(f => f.sectionId === sectionId);
    if (!frame) {
      blockers.push({ code: 'section_missing', message: sectionId });
      continue;
    }
    const prev = frame.penNodeId;
    frame.penNodeId = penNodeId;
    applied.push({ sectionId, from: prev, to: penNodeId });
  }
  return { ok: blockers.length === 0, blockers, applied, manifest };
}

export function main(
  argv = process.argv.slice(2),
  {
    read = path => readFileSync(path, 'utf8'),
    write = (path, text) => writeFileSync(path, text),
    out = console.log,
    err = console.error,
  } = {}
) {
  try {
    const { sets, dryRun } = parseSetArgs(argv);
    if (sets.size === 0) {
      err(
        'usage: bind-golden-path-nodes.mjs --set sectionId=penNodeId [...] [--dry-run]\n' +
          `allowlist: ${BIND_SECTIONS.join(', ')}`
      );
      return 2;
    }
    const path = MANIFEST;
    const doc = JSON.parse(read(path));
    const result = applyBindings(doc, sets);
    out(JSON.stringify({ dryRun, ...result, path }, null, 2));
    if (!result.ok) return 1;
    if (!dryRun) write(path, `${JSON.stringify(result.manifest, null, 2)}\n`);
    return 0;
  } catch (e) {
    err(String(e?.message ?? e));
    return 1;
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))
)
  process.exitCode = main();
