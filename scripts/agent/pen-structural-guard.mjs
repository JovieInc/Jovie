/**
 * Pen structural-edit guard (JOV-9246). On 2026-10-26 moving slot nodes inside
 * App Shell JwsdW (76 instances) silently dropped every instance's slot
 * overrides. Before any Pencil execute script that moves, deletes, replaces,
 * inserts or reparents nodes, a component that has instances must not be
 * changed unless the edit is property-only, and the .pen file is snapshotted
 * first.
 *
 *   node scripts/agent/pen-structural-guard.mjs --ops ops.txt --instances 76 --file design.pen [--snapshot-dir dir]
 *   node scripts/agent/pen-structural-guard.mjs --ops - --census census.json --target JwsdW --file design.pen < ops
 *
 * Exit 0: allowed (snapshot path printed when taken). Exit 1: refused.
 */

import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Operations that change tree shape rather than node properties. */
const STRUCTURAL_OPS = Object.freeze({
  I: 'insert',
  M: 'move',
  D: 'delete',
  R: 'replace',
  C: 'copy',
});
const PROPERTY_OPS = new Set(['U', 'G', 'S']);

/** Classify a Pencil operations script. Returns { structural: [{op,kind}], propertyOnly }. */
export function classifyOps(script) {
  const structural = [];
  const stripped = script
    .replace(/\/\/.*$/gmu, '')
    .replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/gu, '""');
  for (const m of stripped.matchAll(/(?:^|[^\w.$])([A-Z])\s*\(/gmu)) {
    const op = m[1];
    if (STRUCTURAL_OPS[op]) structural.push({ op, kind: STRUCTURAL_OPS[op] });
    else if (!PROPERTY_OPS.has(op)) structural.push({ op, kind: 'unknown' });
  }
  return { structural, propertyOnly: structural.length === 0 };
}

export function snapshotFile(
  file,
  dir = join(homedir(), '.cache', 'pen-snapshots'),
  now = new Date()
) {
  if (!existsSync(file))
    throw new Error(`cannot snapshot missing file ${file}`);
  mkdirSync(dir, { recursive: true });
  const sha = createHash('sha256')
    .update(readFileSync(file))
    .digest('hex')
    .slice(0, 8);
  const stamp = now.toISOString().replace(/[:.]/gu, '-');
  const target = join(dir, `${basename(file)}.${stamp}.${sha}`);
  copyFileSync(file, target);
  return target;
}

/**
 * The node ids a structural script acts on: the first literal argument of
 * I/M/D/R/C (the node, or the parent for I) and the second of M/C (the new
 * parent). Path ids like "kh2z3/dTGMn" contribute every segment. A component
 * id that only appears as a ref in an inserted instance is not a target.
 */
export function targetsOf(script) {
  const targets = new Set();
  const call =
    /(?:^|[^\w.$])([IMDRC])\s*\(\s*(['"`])([^'"`]+)\2(?:\s*,\s*(['"`])([^'"`]+)\4)?/gmu;
  for (const m of script.replace(/\/\/.*$/gmu, '').matchAll(call)) {
    const ids = [m[3]];
    if ((m[1] === 'M' || m[1] === 'C') && m[5]) ids.push(m[5]);
    for (const id of ids)
      for (const part of id.split('/')) if (part) targets.add(part);
  }
  return [...targets];
}

/** Decide using a census { components, instances, owners }. */
export function decideWithCensus({ script, census, file, snapshotDir, now }) {
  const verdict = classifyOps(script);
  if (verdict.propertyOnly)
    return { allowed: true, reason: 'property-only edit', snapshot: null };
  const hits = [];
  for (const id of targetsOf(script)) {
    const owner =
      census.owners?.[id] ??
      (census.components?.[id] !== undefined ? id : null);
    const n = owner ? Number(census.instances?.[owner] ?? 0) : 0;
    if (n > 0) hits.push({ id, owner, instances: n });
  }
  if (hits.length) {
    const first = hits[0];
    return {
      allowed: false,
      reason: `refused: structural Pen edit touches ${first.id} inside component ${first.owner}, which has ${first.instances} instance(s); this can silently drop instance overrides (JOV-9246). Make it property-only, or copy the component, edit the copy and re-point instances deliberately.`,
      snapshot: null,
      hits,
    };
  }
  const snapshot =
    file && existsSync(file) ? snapshotFile(file, snapshotDir, now) : null;
  return {
    allowed: true,
    reason: 'structural edit touching no component with instances',
    snapshot,
  };
}

/** Decide whether an edit may run. `instances` is the instance count of the edited component. */
export function decide({ script, instances, file, snapshotDir, now }) {
  const verdict = classifyOps(script);
  if (verdict.propertyOnly)
    return { allowed: true, reason: 'property-only edit', snapshot: null };
  if (instances > 0) {
    const kinds = [...new Set(verdict.structural.map(s => s.kind))].join(', ');
    return {
      allowed: false,
      reason: `refused: ${kinds} edit on a component with ${instances} instance(s) can silently drop instance overrides (JOV-9246). Make it property-only, or copy the component, edit the copy and re-point instances deliberately.`,
      snapshot: null,
    };
  }
  const snapshot = file ? snapshotFile(file, snapshotDir, now) : null;
  return {
    allowed: true,
    reason: 'structural edit on a component with no instances',
    snapshot,
  };
}

function main(argv) {
  const arg = name => argv[argv.indexOf(`--${name}`) + 1];
  const opsArg = arg('ops');
  const script = readFileSync(opsArg === '-' ? 0 : opsArg, 'utf8');
  let instances = Number(arg('instances'));
  if (argv.includes('--census')) {
    const census = JSON.parse(readFileSync(arg('census'), 'utf8'));
    instances = Number(census[arg('target')] ?? 0);
  }
  if (!Number.isFinite(instances)) {
    process.stderr.write(
      'pass --instances <n> or --census <json> --target <id>; the instance count is required\n'
    );
    return 2;
  }
  const result = decide({
    script,
    instances,
    file: arg('file'),
    snapshotDir: argv.includes('--snapshot-dir')
      ? arg('snapshot-dir')
      : undefined,
  });
  if (!result.allowed) {
    process.stderr.write(`${result.reason}\n`);
    return 1;
  }
  process.stdout.write(
    `allowed: ${result.reason}${result.snapshot ? `; snapshot ${result.snapshot}` : ''}\n`
  );
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1])
  process.exitCode = main(process.argv.slice(2));
