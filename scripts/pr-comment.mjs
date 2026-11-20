#!/usr/bin/env node
// api-budget: github-user-core 60/hr - on-demand, one REST comment per call
/**
 * Post a routine PR comment with secrets and personal data stripped first.
 *
 *   pnpm pr:comment <number> --body-file <file> [--dry-run]
 *
 * Routine PR text is pre-approved and never waits on Tim (Tim White,
 * 2026-11-12; canon/FLEET.md#routine-writes). The scrub is the guardrail.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { scrubPrText } from './secrets/redact.mjs';

const REPOSITORY = 'JovieInc/Jovie';

export function parse(argv) {
  const a = { number: '', bodyFile: '', dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const f = argv[i];
    if (f === '--body-file') a.bodyFile = argv[++i] ?? '';
    else if (f === '--dry-run') a.dryRun = true;
    else if (/^\d+$/.test(f)) a.number = f;
    else throw new Error(`unknown argument: ${f}`);
  }
  if (!a.number || !a.bodyFile)
    throw new Error(
      'usage: pr:comment <number> --body-file <file> [--dry-run]'
    );
  return a;
}

/** The text that would be posted, and whether the scrub changed it. */
export function prepare(raw) {
  const body = scrubPrText(raw).trim();
  if (!body) throw new Error('empty comment');
  return { body, scrubbed: body !== String(raw).trim() };
}

export function main(argv = process.argv.slice(2), cwd = process.cwd()) {
  const a = parse(argv);
  const { body, scrubbed } = prepare(readFileSync(a.bodyFile, 'utf8'));
  if (scrubbed)
    console.error('scrubbed secrets or personal data from the comment');
  if (a.dryRun) {
    process.stdout.write(`${body}\n`);
    return 0;
  }
  const dir = mkdtempSync(path.join(tmpdir(), 'pr-comment-'));
  try {
    const file = path.join(dir, 'body.json');
    writeFileSync(file, JSON.stringify({ body }));
    const r = spawnSync(
      'node',
      [
        path.join(cwd, 'packages/api-client/cli.ts'),
        'gh',
        '--priority',
        'default',
        '--',
        'api',
        '--method',
        'POST',
        `repos/${REPOSITORY}/issues/${a.number}/comments`,
        '--input',
        file,
        '--jq',
        '.html_url',
      ],
      { cwd, encoding: 'utf8' }
    );
    if (r.status !== 0) {
      console.error((r.stderr || r.stdout || 'comment failed').trim());
      return 1;
    }
    process.stdout.write(r.stdout);
    return 0;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    process.exit(main());
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(2);
  }
}
