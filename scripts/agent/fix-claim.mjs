#!/usr/bin/env node
/**
 * Fix claim: before an agent or lane opens a PR that fixes a failing check,
 * find the open PRs that already touch the same file or name the same test.
 *
 *   node scripts/agent/fix-claim.mjs [--repo owner/name] --file <path>... [--test <id>...]
 *
 * Exit 0: no open PR overlaps, so open yours. Exit 2: overlapping PRs are
 * printed as JSON; join one (comment, push to it, or wait for it to land)
 * instead of opening another. On 2026-10-12 LogYourBody main went red on one
 * EISDIR in eve-core-chat-boundary.test.ts, and #1350, #1351 and #1354 each
 * carried their own copy of the same fix.
 */

import { execFileSync } from 'node:child_process';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const OPEN_PR_FIELDS = 'number,title,url,headRefName,isDraft,body,files';

/**
 * @param {{ prs: Array<{number: number, title?: string, url?: string, headRefName?: string, isDraft?: boolean, body?: string, files?: Array<{path: string}>}>, files?: string[], tests?: string[], self?: number | null }} input
 */
export function findOverlappingFixes({
  prs,
  files = [],
  tests = [],
  self = null,
}) {
  const wanted = new Set(files);
  const names = tests.filter(Boolean);
  const overlaps = [];
  for (const pr of prs ?? []) {
    if (pr.number === self) continue;
    const sharedFiles = (pr.files ?? [])
      .map(file => file.path)
      .filter(path => wanted.has(path));
    const text = `${pr.title ?? ''}\n${pr.body ?? ''}`;
    const namedTests = names.filter(name => text.includes(name));
    if (sharedFiles.length || namedTests.length) {
      overlaps.push({
        number: pr.number,
        url: pr.url,
        title: pr.title,
        branch: pr.headRefName,
        draft: Boolean(pr.isDraft),
        sharedFiles,
        namedTests,
      });
    }
  }
  return overlaps.sort((a, b) => a.number - b.number);
}

export function parseArgs(argv) {
  const parsed = { repo: null, files: [], tests: [], self: null };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!value || value.startsWith('--'))
      throw new Error(`${flag} needs a value`);
    if (flag === '--repo') parsed.repo = value;
    else if (flag === '--file') parsed.files.push(value);
    else if (flag === '--test') parsed.tests.push(value);
    else if (flag === '--self') parsed.self = Number(value);
    else throw new Error(`unknown flag ${flag}`);
    index += 1;
  }
  if (!parsed.files.length && !parsed.tests.length) {
    throw new Error('name at least one --file or --test');
  }
  return parsed;
}

export function main(
  argv,
  {
    gh = args =>
      execFileSync('gh', args, {
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
      }),
  } = {}
) {
  const args = parseArgs(argv);
  const prs = JSON.parse(
    gh([
      'pr',
      'list',
      ...(args.repo ? ['--repo', args.repo] : []),
      '--state',
      'open',
      '--limit',
      '200',
      '--json',
      OPEN_PR_FIELDS,
    ]) || '[]'
  );
  const overlaps = findOverlappingFixes({ prs, ...args });
  return { code: overlaps.length ? 2 : 0, overlaps };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    const { code, overlaps } = main(process.argv.slice(2));
    process.stdout.write(`${JSON.stringify({ overlaps }, null, 2)}\n`);
    if (code)
      process.stderr.write(
        'fix-claim: an open PR already touches this failure; join it instead of opening another.\n'
      );
    process.exitCode = code;
  } catch (error) {
    process.stderr.write(
      `fix-claim: ${error instanceof Error ? error.message : error}\n`
    );
    process.exitCode = 1;
  }
}
