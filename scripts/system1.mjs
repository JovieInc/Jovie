#!/usr/bin/env node
/**
 * System-1 router CLI (callable from Python lanes and shell).
 *
 *   system1.mjs call   --task T [--key K] [--state-file F|-] [--image F]... [--shadow]
 *   system1.mjs label  --task T (--key K | --input-hash H) --label L [--source S] [--evidence E]
 *   system1.mjs seed   --task T --manifest M.json     call + label a known-answer set
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { loadRegistry, system1Call } from './lib/system1/router.mjs';
import { createStore, LABEL_SCHEMA } from './lib/system1/store.mjs';

function parse(argv) {
  const args = { _: [], image: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) {
      args._.push(a);
      continue;
    }
    const name = a.slice(2);
    const flag = name === 'shadow';
    const value = flag ? true : argv[++i];
    if (name === 'image') args.image.push(value);
    else args[name] = value;
  }
  return args;
}

const out = v => process.stdout.write(`${JSON.stringify(v, null, 2)}\n`);

export async function main(argv, deps = {}) {
  const [cmd] = argv;
  const args = parse(argv.slice(1));
  const registry = deps.registry ?? loadRegistry();
  const store = deps.store ?? createStore();
  const now = deps.now ?? Date.now;
  const callDeps = { registry, store, now, ...(deps.callDeps ?? {}) };

  if (cmd === 'call') {
    const state =
      args['state-file'] === '-' || !args['state-file']
        ? readFileSync(0, 'utf8')
        : readFileSync(args['state-file'], 'utf8');
    const row = await system1Call(
      {
        task: args.task,
        state,
        key: args.key,
        caller: args.caller ?? 'cli',
        shadow: Boolean(args.shadow),
        images: args.image.map(f => readFileSync(f)),
      },
      callDeps
    );
    out(row);
    return row.status === 'ok' ? 0 : 75;
  }
  if (cmd === 'label') {
    if (!args.task || !args.label || (!args.key && !args['input-hash']))
      throw new Error('label needs --task, --label and --key or --input-hash');
    const row = {
      schema: LABEL_SCHEMA,
      ts: new Date(now()).toISOString(),
      task: args.task,
      key: args.key ?? null,
      inputHash: args['input-hash'] ?? null,
      label: args.label,
      source: args.source ?? 'manual',
      evidence: args.evidence ?? null,
    };
    store.appendLabel(row);
    out(row);
    return 0;
  }
  if (cmd === 'seed') {
    const manifest = JSON.parse(readFileSync(args.manifest, 'utf8'));
    const base = dirname(resolve(args.manifest));
    const rows = [];
    for (const item of manifest.items) {
      const state =
        item.state ??
        (item.stateFile
          ? readFileSync(resolve(base, item.stateFile), 'utf8')
          : (manifest.state ?? 'Screenshot.'));
      const call = await system1Call(
        {
          task: args.task,
          state,
          key: item.key,
          caller: 'seed',
          images: (item.images ?? []).map(f => readFileSync(resolve(base, f))),
        },
        callDeps
      );
      store.appendLabel({
        schema: LABEL_SCHEMA,
        ts: new Date(now()).toISOString(),
        task: args.task,
        key: item.key,
        label: item.label,
        source: manifest.source ?? 'seed',
      });
      rows.push({
        key: item.key,
        label: item.label,
        decision: call.decision,
        status: call.status,
        costUsd: call.costUsd,
      });
    }
    out(rows);
    return 0;
  }
  process.stderr.write('usage: system1.mjs call|label|seed\n');
  return 2;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)
) {
  main(process.argv.slice(2)).then(
    code => process.exit(code),
    e => {
      process.stderr.write(`${e.message}\n`);
      process.exit(1);
    }
  );
}
