/** Chunk attribution for the existing route-JS guard; no budget policy changes. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

/**
 * Drop the CI sourceMappingURL trailer. It is not executed code, and the
 * sibling map is not part of this budget.
 * @param {Buffer} bytes
 * @returns {Buffer}
 */
export function budgetJsBytes(bytes) {
  const source = bytes.toString('utf8');
  const stripped = source.replace(/\r?\n\/\/# sourceMappingURL=\S+\s*$/, '');
  return stripped === source ? bytes : Buffer.from(stripped);
}

/**
 * Explain only requested routes, using the same unique initial files and gzip -9
 * arithmetic as the guard. Dynamic chunks absent from the manifest stay absent.
 * @param {string} nextDir
 * @param {{route: string, files: Set<string>}[]} routeFiles
 * @param {Set<string>} requested
 */
export function chunkContributions(nextDir, routeFiles, requested) {
  /** @type {Map<string, {route: string, gzipBytes: number, chunks: {file: string, gzipBytes: number}[]}>} */
  const routes = new Map();
  /** @type {Map<string, number>} */
  const sizes = new Map();
  for (const { route, files } of routeFiles) {
    if (!requested.has(route)) continue;
    const chunks = [...files]
      .map(file => {
        const gzipBytes =
          sizes.get(file) ??
          gzipSync(budgetJsBytes(readFileSync(join(nextDir, file))), {
            level: 9,
          }).length;
        sizes.set(file, gzipBytes);
        return { file, gzipBytes };
      })
      .sort(
        (a, b) => b.gzipBytes - a.gzipBytes || a.file.localeCompare(b.file)
      );
    const gzipBytes = chunks.reduce((sum, chunk) => sum + chunk.gzipBytes, 0);
    // Parallel-route manifests can name the same URL: explain its heaviest
    // measured entry, never an artificial union of mutually exclusive chunks.
    if (!routes.has(route) || gzipBytes > routes.get(route).gzipBytes)
      routes.set(route, { route, gzipBytes, chunks });
  }
  return [...routes.values()];
}

export function printRows(rows) {
  for (const row of rows) {
    const mark = row.ok ? 'ok  ' : row.budgetKb === null ? 'NEW ' : 'OVER';
    console.log(
      `${mark} ${String(row.gzipKb).padStart(5)} / ${String(row.budgetKb ?? '-').padStart(5)} KB gz  ${row.route}`
    );
  }
}

/**
 * JOV-8561: the per-route-group table. One row per route-budgets.json group:
 * worst measured route against the group's own operative baseline, with the
 * group target from route-budgets.json alongside it.
 */
export function printGroupRows(groups) {
  console.log('\nRoute-group initial-JS budgets (JOV-8561)');
  for (const row of groups.rows) {
    const mark = row.ok ? 'ok  ' : 'OVER';
    console.log(
      `${mark} ${String(row.worstKb).padStart(5)} / ${String(row.baselineKb).padStart(5)} KB gz  ${row.group} group (target ${row.targetKb} KB; ${row.routes} routes; worst ${row.worstRoute})`
    );
  }
}
