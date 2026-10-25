#!/usr/bin/env node
/**
 * System-1 router CLI (callable from Python lanes and shell).
 *
 *   system1.mjs call   --task T [--key K] [--state-file F|-] [--image F]... [--shadow]
 *   system1.mjs label  --task T (--key K | --input-hash H) --label L [--source S] [--evidence E]
 *   system1.mjs seed   --task T --manifest M.json     call + label a known-answer set
 *   system1.mjs label-outcomes [--task T] [--mirror F]...   join Linear outcomes onto calls
 *   system1.mjs report [--json]
 *   system1.mjs tune   (--task T | --all) [--apply] [--no-replay] [--no-routes]
 *   system1.mjs weekly                                 report + tune --all --apply + receipt
 *   system1.mjs rollback --task T
 *   system1.mjs versions --task T
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { buildReport } from './lib/system1/eval.mjs';
import {
  defaultMirrorPaths,
  LABELERS,
  labelOutcomes,
  loadMirrorIssues,
} from './lib/system1/labelers.mjs';
import {
  activeVersion,
  loadRegistry,
  system1Call,
} from './lib/system1/router.mjs';
import { createStore, LABEL_SCHEMA } from './lib/system1/store.mjs';
import { rollback, tuneTask } from './lib/system1/tune.mjs';

function parse(argv) {
  const args = { _: [], image: [], mirror: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) {
      args._.push(a);
      continue;
    }
    const name = a.slice(2);
    const flag = [
      'shadow',
      'json',
      'apply',
      'all',
      'no-replay',
      'no-routes',
    ].includes(name);
    const value = flag ? true : argv[++i];
    if (name === 'image') args.image.push(value);
    else if (name === 'mirror') args.mirror.push(value);
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
  if (cmd === 'label-outcomes') {
    const paths = args.mirror.length ? args.mirror : defaultMirrorPaths();
    const issues = deps.issues ?? loadMirrorIssues(paths);
    const tasks = args.task ? [args.task] : Object.keys(LABELERS);
    out(tasks.map(task => labelOutcomes({ store, task, issues, now })));
    return 0;
  }
  if (cmd === 'report') {
    const report = buildReport(
      registry,
      store,
      id => activeVersion(registry, id, store),
      now
    );
    store.saveReport(report);
    out(report);
    return 0;
  }
  if (cmd === 'tune' || cmd === 'weekly') {
    const ids =
      args.all || cmd === 'weekly' ? Object.keys(registry.tasks) : [args.task];
    const results = [];
    let joined = [];
    // Model replays need a credential. Weekly on a host without one still joins
    // outcomes, reports and tunes offline (floors and cutoffs) instead of failing.
    const env = deps.env ?? process.env;
    const hasCredential = Boolean(
      deps.run || env.AI_GATEWAY_API_KEY || env.CLOUDFLARE_WORKERS_AI_TOKEN
    );
    const replay = cmd === 'weekly' ? hasCredential : !args['no-replay'];
    if (cmd === 'weekly') {
      const issues = deps.issues ?? loadMirrorIssues(defaultMirrorPaths());
      joined = Object.keys(LABELERS).map(task =>
        labelOutcomes({ store, task, issues, now })
      );
    }
    for (const task of ids) {
      results.push(
        await tuneTask({
          registry,
          store,
          task,
          apply: cmd === 'weekly' || Boolean(args.apply),
          replay,
          tryRoutes: !args['no-routes'],
          now,
          deps: callDeps,
          run: deps.run,
        })
      );
    }
    const report = buildReport(
      registry,
      store,
      id => activeVersion(registry, id, store),
      now
    );
    report.outcomeJoin = joined;
    report.replay = replay ? 'on' : 'off';
    report.tuning = results.map(r => ({
      task: r.task,
      status: r.status,
      promoted: r.promoted,
      current: r.current,
      heldout: r.heldout,
      candidates: r.candidates.map(c => ({
        kind: c.kind,
        detail: c.detail,
        gain: c.gain,
        wins: c.wins,
        losses: c.losses,
        promote: c.promote,
        guardrailFailures: c.guardrailFailures,
      })),
    }));
    store.saveReport(report);
    out(cmd === 'weekly' ? report : results);
    return 0;
  }
  if (cmd === 'rollback') {
    out(rollback(store, args.task, now));
    return 0;
  }
  if (cmd === 'versions') {
    out(store.versions(args.task) ?? { active: null, history: [] });
    return 0;
  }
  process.stderr.write(
    'usage: system1.mjs call|label|seed|report|tune|weekly|rollback|versions\n'
  );
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
