#!/usr/bin/env node
/**
 * Pen binding manifest CLI.
 *
 *   node scripts/design/pen-bindings.mjs validate [--file <path>] [--no-fs]
 *   node scripts/design/pen-bindings.mjs status
 *   node scripts/design/pen-bindings.mjs routes-for <changed-file>...
 *
 * validate exits 1 on any problem. status lists BOUND and UNBOUND routes.
 * routes-for prints the routes whose sources cover the changed files as JSON
 * (the diff gate's input).
 */
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BINDINGS_PATH,
  loadBindings,
  REPO_ROOT,
  routeState,
  routesForFiles,
  validateBindings,
} from './pen-bindings-lib.mjs';

export function main(
  argv = process.argv.slice(2),
  { root = REPO_ROOT, out = console.log, err = console.error } = {}
) {
  const [cmd, ...rest] = argv;
  const fileIdx = rest.indexOf('--file');
  const path = fileIdx >= 0 ? rest[fileIdx + 1] : BINDINGS_PATH;
  if (cmd === 'validate') {
    const doc = loadBindings(root, path);
    const errors = validateBindings(doc, {
      root: rest.includes('--no-fs') ? null : root,
    });
    for (const e of errors) err(`[pen-bindings] x ${e}`);
    if (errors.length) return 1;
    const routes = Object.values(doc.routes);
    const bound = routes.filter(r => routeState(r) === 'bound').length;
    out(
      `[pen-bindings] ok: ${routes.length} routes, ${bound} bound, ${routes.length - bound} unbound`
    );
    return 0;
  }
  if (cmd === 'status') {
    const doc = loadBindings(root, path);
    for (const [route, entry] of Object.entries(doc.routes))
      out(
        `${routeState(entry).toUpperCase().padEnd(8)} ${entry.scope.padEnd(11)} ${route}`
      );
    return 0;
  }
  if (cmd === 'routes-for') {
    out(
      JSON.stringify(
        routesForFiles(
          loadBindings(root, path),
          rest.filter(a => !a.startsWith('--'))
        )
      )
    );
    return 0;
  }
  err(
    'usage: pen-bindings.mjs validate|status|routes-for <files...> [--file <path>] [--no-fs]'
  );
  return 2;
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
)
  process.exitCode = main();
