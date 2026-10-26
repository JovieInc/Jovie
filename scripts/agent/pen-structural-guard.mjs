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
