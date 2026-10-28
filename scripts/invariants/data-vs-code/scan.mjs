#!/usr/bin/env node
// Warn-first heuristic: flag large hardcoded content/config literals in app
// code. Always exits 0 unless --strict is passed. See .claude/rules/data-vs-code.md.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const MIN_LINES = 60;
const MIN_STRINGS = 15;
const ROOTS = [
  'apps/web/app',
  'apps/web/components',
  'apps/web/lib',
  'apps/web/constants',
];
const SKIP =
  /(\.test\.|\.spec\.|\.stories\.|\/generated\/|__tests__|\/tests?\/|\/schema\/|\.d\.ts$)/;
const OPEN =
  /^(?:export\s+)?const\s+([A-Za-z0-9_]+)(?:\s*:[^=]+)?\s*=\s*[[{]\s*$/;
const WAIVER = /data-vs-code:\s*code\b/;

export function scanSource(text) {
  const lines = text.split('\n');
  const findings = [];
  for (let i = 0; i < lines.length; i++) {
    const open = OPEN.exec(lines[i]);
    if (!open) continue;
    if (i > 0 && WAIVER.test(lines[i - 1])) continue;
    let end = -1;
    for (let j = i + 1; j < lines.length; j++) {
      if (/^[\]}]/.test(lines[j])) {
        end = j;
        break;
      }
    }
    if (end < 0) continue;
    const block = lines.slice(i, end + 1);
    const strings = (
      block.join('\n').match(/(['"`])(?:(?!\1)[^\\\n]|\\.)+\1/g) ?? []
    ).length;
    if (block.length >= MIN_LINES && strings >= MIN_STRINGS)
      findings.push({
        name: open[1],
        line: i + 1,
        lines: block.length,
        strings,
      });
    i = end;
  }
  return findings;
}

export function run(argv = process.argv.slice(2)) {
  const files = execFileSync('git', ['ls-files', '-z', '--', ...ROOTS], {
    encoding: 'utf8',
  })
    .split('\0')
    .filter(f => /\.(ts|tsx)$/.test(f) && !SKIP.test(f));
  const rows = files.flatMap(file =>
    scanSource(readFileSync(file, 'utf8')).map(f => ({ file, ...f }))
  );
  rows.sort((a, b) => b.lines - a.lines);
  for (const r of rows)
    console.log(
      `${r.file}:${r.line} ${r.name} (${r.lines} lines, ${r.strings} strings)`
    );
  console.log(`data-vs-code: ${rows.length} candidate literal(s) (warn-only)`);
  return argv.includes('--strict') && rows.length > 0 ? 1 : 0;
}

if (import.meta.url === `file://${process.argv[1]}`) process.exitCode = run();
