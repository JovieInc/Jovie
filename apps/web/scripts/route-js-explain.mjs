#!/usr/bin/env node
// Extend the budget reader with chunk attribution, without changing its verdict.
// Usage: node apps/web/scripts/route-js-explain.mjs --route /app/admin/room
import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { gzipSync } from 'node:zlib';
import { budgetJsBytes, collectRouteFiles } from './route-js-budget.mjs';

export function explainRouteJs(nextDir, route) {
  const entry = collectRouteFiles(nextDir).find(row => row.route === route);
  if (!entry) throw new Error(`No client manifest for ${route}`);
  return [...entry.files]
    .map(file => {
      const bytes = readFileSync(join(nextDir, file));
      // Turbopack gives maps their own content hash, distinct from the JS hash.
      const mapName = bytes
        .toString('utf8')
        .match(/\/\/# sourceMappingURL=(\S+)\s*$/)?.[1];
      const mapPath =
        mapName && basename(mapName) === mapName
          ? join(nextDir, dirname(file), mapName)
          : join(nextDir, `${file}.map`);
      const map = existsSync(mapPath)
        ? JSON.parse(readFileSync(mapPath, 'utf8'))
        : null;
      return {
        file,
        gzipBytes: gzipSync(budgetJsBytes(bytes), {
          level: 9,
        }).length,
        // Null distinguishes unavailable attribution from an empty source map.
        sources: map ? [...new Set(map.sources ?? [])].sort() : null,
      };
    })
    .sort((a, b) => b.gzipBytes - a.gzipBytes || a.file.localeCompare(b.file));
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const { values } = parseArgs({
    options: {
      route: { type: 'string' },
      'next-dir': { type: 'string', default: 'apps/web/.next' },
    },
  });
  if (!values.route) throw new Error('--route is required');
  const chunks = explainRouteJs(resolve(values['next-dir']), values.route);
  console.log(JSON.stringify({ route: values.route, chunks }, null, 2));
}
