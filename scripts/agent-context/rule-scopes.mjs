#!/usr/bin/env node
// Explicit authoring command; CI and hooks only verify the reviewed record.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const MANIFEST = 'scripts/agent-context/rule-scopes.json';

export function collectRuleScopes(files, read) {
  return [...files].sort().map(file => {
    const match = read(file).match(/^---\npaths: (.+)\n---\n\n([\s\S]*)$/);
    if (!match) throw new Error(`${file}: invalid scoped-rule frontmatter`);
    const paths = JSON.parse(match[1]);
    if (!Array.isArray(paths) || paths.length === 0 ||
      paths.some(path => typeof path !== 'string' || !path.trim()))
      throw new Error(`${file}: paths must be nonempty strings`);
    return {file, paths, bodySha256: createHash('sha256').update(match[2]).digest('hex')};
  });
}

export function checkRuleScopes(actual, recorded) {
  assert.deepEqual(recorded, actual,
    'Scoped-rule integrity record is stale. Review the rule edit, then run node scripts/agent-context/rule-scopes.mjs --write and stage the record.');
}

export function runRuleScopes(root, args) {
  if (args.some(arg => !['--write', '--staged'].includes(arg)) ||
    (args.includes('--write') && args.includes('--staged')))
    throw new Error('Use --write for explicit authoring, or --staged for index verification');
  const git = argv => execFileSync('git', argv, {cwd: root, encoding: 'utf8'});
  const staged = args.includes('--staged');
  const files = staged
    ? git(['ls-files', '--cached', '-z', '--', '.claude/rules']).split('\0').filter(file => file.endsWith('.md'))
    : readdirSync(resolve(root, '.claude/rules')).filter(file => file.endsWith('.md')).map(file => `.claude/rules/${file}`);
  const read = file => staged ? git(['show', `:${file}`]) : readFileSync(resolve(root, file), 'utf8');
  const scopes = collectRuleScopes(files, read);
  if (args.includes('--write')) {
    writeFileSync(resolve(root, MANIFEST), `${JSON.stringify(scopes, null, 2)}\n`);
  } else {
    checkRuleScopes(scopes, JSON.parse(read(MANIFEST)));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    runRuleScopes(process.cwd(), process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
