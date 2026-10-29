#!/usr/bin/env node
// Paste-ready "## Build-vs-buy" facts for one npm package (canon/BUILD_VS_BUY.md).
// Usage: node scripts/build-vs-buy-facts.mjs <package> [--json]
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const npm = (args, cwd) =>
  spawnSync('npm', args, { cwd, encoding: 'utf8', timeout: 120_000 });

/** Pure: turn registry metadata and a dry-run install into the section lines. */
export function formatFacts({ name, meta, transitive, now = Date.now() }) {
  const modified = meta.time?.[meta.version] ?? meta.time?.modified;
  const ageDays = modified
    ? Math.floor((now - Date.parse(modified)) / 86_400_000)
    : null;
  const kb = meta.dist?.unpackedSize
    ? Math.round(meta.dist.unpackedSize / 1024)
    : null;
  return [
    `- Package: ${name}@${meta.version}`,
    `- Size: ${kb === null ? 'unknown' : `${kb} KB unpacked`}`,
    `- Transitive: ${transitive === null ? 'unknown' : `${transitive} packages (dry-run install)`}`,
    `- Maintenance: last release ${ageDays === null ? 'unknown' : `${ageDays}d ago`}, ${
      Array.isArray(meta.maintainers) ? meta.maintainers.length : '?'
    } maintainers, license ${meta.license ?? 'unknown'}; check open CVEs with \`pnpm audit\` before relying on this`,
    '- Why: <why not a few lines, an existing dependency, or a platform feature>',
  ].join('\n');
}

export function main(argv = process.argv.slice(2)) {
  const name = argv.find(arg => !arg.startsWith('-'));
  if (!name) {
    console.error('usage: build-vs-buy-facts.mjs <package> [--json]');
    return 2;
  }
  const view = npm(['view', name, '--json']);
  if (view.status !== 0) {
    console.error(
      `npm view ${name} failed: ${view.stderr.trim().slice(0, 300)}`
    );
    return 1;
  }
  const meta = JSON.parse(view.stdout);
  const dir = mkdtempSync(join(tmpdir(), 'bvb-'));
  try {
    writeFileSync(
      join(dir, 'package.json'),
      '{"name":"bvb-probe","private":true}'
    );
    const dry = npm(
      [
        'install',
        `${name}@${meta.version}`,
        '--dry-run',
        '--json',
        '--ignore-scripts',
        '--no-audit',
        '--no-fund',
      ],
      dir
    );
    let transitive = null;
    try {
      // The package itself is one of the "added" entries.
      transitive = Math.max(
        0,
        JSON.parse(dry.stdout.slice(dry.stdout.indexOf('{'))).added - 1
      );
    } catch {
      // Leave unknown; the section requires a number, so the author fills it in.
    }
    console.log(
      argv.includes('--json')
        ? JSON.stringify({ name, version: meta.version, transitive })
        : formatFacts({ name, meta, transitive })
    );
    return 0;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  process.exitCode = main();
