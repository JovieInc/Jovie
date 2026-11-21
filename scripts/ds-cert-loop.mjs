#!/usr/bin/env node
/**
 * Design-system certification fix loop. See scripts/lib/ds-cert-loop.mjs.
 *   node scripts/ds-cert-loop.mjs status
 *   node scripts/ds-cert-loop.mjs plan [--size 30] [--out-dir dir]
 *   node scripts/ds-cert-loop.mjs verify --order dir/dsc-01.json
 *   node scripts/ds-cert-loop.mjs verify --component a.tsx --component b.tsx
 *   node scripts/ds-cert-loop.mjs gate --shard my-branch [--order f]
 * Add --root <checkout> to run against another checkout.
 * `verify` exits 1 and lists what is left until the order is done.
 */
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { REPO_ROOT } from './component-ship-policy.mjs';
import { readCertificationRegistry } from './lib/component-certification-registry.mjs';
import {
  formatStatus,
  newGates,
  planOrders,
  remaining,
  verifyOrder,
} from './lib/ds-cert-loop.mjs';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    size: { type: 'string', default: '30' },
    'out-dir': { type: 'string', default: 'tmp/ds-cert-loop' },
    order: { type: 'string' },
    component: { type: 'string', multiple: true },
    registry: {
      type: 'string',
      default: 'docs/design-system/component-certification.json',
    },
    json: { type: 'boolean', default: false },
    shard: { type: 'string' },
    root: { type: 'string' },
  },
});
const command = positionals[0];
// --root runs this copy of the loop against another checkout.
const root = values.root ? resolve(values.root) : REPO_ROOT;

function certify(components) {
  const out = join(mkdtempSync(join(tmpdir(), 'ds-cert-loop-')), 'report.json');
  const args = ['scripts/component-certificate.mjs', '--out', out];
  if (components) for (const c of components) args.push('--component', c);
  else args.push('--all');
  execFileSync(process.execPath, args, { cwd: root, stdio: 'ignore' });
  return JSON.parse(readFileSync(out, 'utf8'));
}

function gates() {
  const { registry, errors } = readCertificationRegistry(root, values.registry);
  if (errors.length) {
    console.error(errors.join('\n'));
    process.exit(2);
  }
  return registry.gates ?? {};
}

function headSha() {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root })
      .toString()
      .trim();
  } catch {
    return 'unknown';
  }
}

if (command === 'status') {
  const rows = remaining(certify(), gates());
  if (values.json) console.log(JSON.stringify({ left: rows.length, rows }));
  else console.log(formatStatus(rows));
  process.exit(0);
}

if (command === 'plan') {
  const rows = remaining(certify(), gates());
  const orders = planOrders(rows, {
    size: Number(values.size),
    headSha: headSha(),
  });
  const dir = resolve(root, values['out-dir']);
  mkdirSync(dir, { recursive: true });
  for (const order of orders)
    writeFileSync(
      join(dir, `${order.id}.json`),
      `${JSON.stringify(order, null, 2)}\n`
    );
  console.log(formatStatus(rows));
  console.log(`${orders.length} work order(s) in ${values['out-dir']}`);
  process.exit(0);
}

function readOrder(file) {
  if (!existsSync(file)) {
    console.error(`no order file at ${file}; run plan first or check the path`);
    process.exit(2);
  }
  return JSON.parse(readFileSync(file, 'utf8'));
}

if (command === 'verify') {
  const order = values.order
    ? readOrder(values.order)
    : { components: values.component ?? [], skipped: {} };
  if (!order.components?.length) {
    console.error('verify needs --order <file> or --component <path>');
    process.exit(2);
  }
  const result = verifyOrder(
    order.components,
    certify(order.components),
    gates(),
    order.skipped ?? {}
  );
  console.log(
    `ds-cert-loop verify: ${result.done}/${result.total} done, ${result.skipped} skipped`
  );
  for (const line of result.problems) console.log(`  ${line}`);
  process.exit(result.ok ? 0 : 1);
}

if (command === 'gate') {
  if (!values.shard || !/^[\w.-]+$/.test(values.shard)) {
    console.error('gate needs --shard <name> (letters, digits, . _ -)');
    process.exit(2);
  }
  const only = values.order
    ? readOrder(values.order).components
    : values.component;
  const { owner } = readCertificationRegistry(root, values.registry);
  const added = newGates(certify(only), gates(), only);
  const shard = join(
    'docs/design-system/component-certification.d',
    `${values.shard}.json`
  );
  // A component some file already names keeps its key there, widened to
  // every static criterion; the rest go to this branch's own shard.
  const byFile = new Map();
  for (const [component, criteria] of Object.entries(added)) {
    const file = owner.gates?.[component] ?? shard;
    if (!byFile.has(file)) byFile.set(file, {});
    byFile.get(file)[component] = criteria;
  }
  for (const [rel, entries] of byFile) {
    const file = join(root, rel);
    const doc = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
    const merged = { ...(doc.gates ?? {}), ...entries };
    doc.gates = Object.fromEntries(
      Object.entries(merged).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    );
    writeFileSync(file, `${JSON.stringify(doc, null, 2)}\n`);
  }
  console.log(
    `ds-cert-loop gate: ${Object.keys(added).length} gate(s) in ${byFile.size} file(s)`
  );
  process.exit(0);
}

console.error('usage: ds-cert-loop.mjs status | plan | verify | gate');
process.exit(2);
