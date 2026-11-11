#!/usr/bin/env node
// size-500 budgets are shrink-only. The pinned guard (JovieInc/ci
// guards/size.mjs) fails a file that grows past its entry here and passes a
// file that stays the same or shrinks, so a PR that does not grow a big file
// never needs to edit size-baseline.json. This script keeps it that way:
//
//   --no-raise <base-ref>  fail when this tree's baseline raises an entry or
//                          adds a file, compared with <base-ref>. Raising a
//                          budget is growth: extract a module instead. A file
//                          git sees as renamed may carry its old budget.
//   --tighten              lower every entry to the file's current line count
//                          and drop files at or under 500 lines or deleted.
//                          Never raises; fails if a baselined file grew.
//
// A PR that shrinks a file leaves the entry alone; one --tighten sweep lowers
// many entries at once, so parallel PRs do not edit neighbouring lines.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  compareToBaseline,
  tightenBaseline,
} from '../lib/shrink-only-baseline.mjs';

export const BASELINE = 'scripts/company-guards/size-baseline.json';
const LIMIT = 500;

/** Lines as the size guard counts them (a final newline is not a line). */
export function countLines(text) {
  return text.split('\n').length - (text.endsWith('\n') ? 1 : 0);
}

/**
 * Entries in `head` above `base`. A new key is allowed only when git saw it as
 * a rename of a removed key (`renames`: new path -> old path) and it keeps at
 * most that budget. Budget freed by an unrelated deletion is never reused.
 */
export function raisedEntries(base, head, renames = {}) {
  const raised = [];
  for (const [key, value] of Object.entries(head)) {
    const from = Object.hasOwn(base, key) ? key : renames[key];
    const was =
      from !== undefined && Object.hasOwn(base, from) ? base[from] : null;
    if (was === null || value > was)
      raised.push({ file: key, base: was, head: value });
  }
  return raised.sort((a, b) => a.file.localeCompare(b.file));
}

/** {new path: old path} for renames between `ref` and HEAD (git -M). */
export function parseRenames(nameStatus) {
  const renames = {};
  for (const line of nameStatus.split('\n')) {
    const [status, from, to] = line.split('\t');
    if (status?.startsWith('R') && from && to) renames[to] = from;
  }
  return renames;
}

/** Measured counts for baselined files; 0 for gone or within the limit. */
export function measure(baseline, read) {
  return Object.fromEntries(
    Object.keys(baseline).map(file => {
      const text = read(file);
      const lines = text === null ? 0 : countLines(text);
      return [file, lines > LIMIT ? lines : 0];
    })
  );
}

function main(argv) {
  const root = fileURLToPath(new URL('../..', import.meta.url));
  const readTree = file =>
    existsSync(`${root}/${file}`)
      ? readFileSync(`${root}/${file}`, 'utf8')
      : null;
  const baseline = JSON.parse(readTree(BASELINE));
  const at = argv.indexOf('--no-raise');
  if (at !== -1) {
    const ref = argv[at + 1];
    if (!ref) throw new Error('--no-raise needs a base ref');
    const base = JSON.parse(
      execFileSync('git', ['show', `${ref}:${BASELINE}`], {
        cwd: root,
        encoding: 'utf8',
        maxBuffer: 1 << 26,
      })
    );
    const renames = parseRenames(
      execFileSync('git', ['diff', '-M', '--name-status', ref, 'HEAD'], {
        cwd: root,
        encoding: 'utf8',
        maxBuffer: 1 << 26,
      })
    );
    const raised = raisedEntries(base, baseline, renames);
    for (const { file, base: was, head } of raised)
      console.error(
        `::error file=${BASELINE}::size-500 budget for ${file} raised ${was ?? 'unbaselined'} -> ${head}; budgets only shrink, extract a cohesive module instead`
      );
    if (raised.length) process.exitCode = 1;
    else console.log('[size-baseline] no budget raised');
    return;
  }
  if (argv.includes('--tighten')) {
    const current = measure(baseline, readTree);
    const { growth } = compareToBaseline(current, baseline);
    for (const { path, count, baseline: was } of growth)
      console.error(`[size-baseline] ${path[0]} grew ${was} -> ${count}`);
    const { baseline: next, tightened } = tightenBaseline(current, baseline);
    writeFileSync(`${root}/${BASELINE}`, `${JSON.stringify(next, null, 2)}\n`);
    console.log(`[size-baseline] tightened ${tightened.length} entries`);
    if (growth.length) process.exitCode = 1;
    return;
  }
  throw new Error('usage: size-ratchet.mjs --no-raise <base-ref> | --tighten');
}

if (process.argv[1] === fileURLToPath(import.meta.url))
  main(process.argv.slice(2));
