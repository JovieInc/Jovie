#!/usr/bin/env node
/**
 * One entry point for the anti-slop guardrails.
 *   node scripts/anti-slop/run.mjs validate            registry integrity, wiring, prose drift (CI)
 *   node scripts/anti-slop/run.mjs list [--scope s]    rules, with status
 *   node scripts/anti-slop/run.mjs check --files a b   run the static rules over files before showing them
 *   node scripts/anti-slop/run.mjs legacy --write      rewrite legacy-copies.json (shrink only)
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  checkDrift,
  checkTitleCaseHeadings,
  findUnregisteredCopies,
  LEGACY_PATH,
  loadRegistry,
  REPO_ROOT,
  summarize,
  validateRegistry,
} from './lib.mjs';

export function runValidate(root = REPO_ROOT) {
  const reg = loadRegistry(root);
  const { errors } = validateRegistry(reg, root);
  const drift = checkDrift(reg, root);
  return {
    errors: [...errors, ...drift.errors, ...checkTitleCaseHeadings(root)],
    summary: summarize(reg),
    copies: drift.current.length,
  };
}

/** Static matchers declared in the registry run on any file, including HTML artifacts. */
export function runMatchers(reg, files, root = REPO_ROOT) {
  const findings = [];
  for (const rule of reg.rules) {
    for (const matcher of rule.enforcement.matchers ?? []) {
      const re = new RegExp(matcher.pattern, matcher.flags ?? 'iu');
      const fileRe = matcher.files ? new RegExp(matcher.files, 'u') : null;
      for (const file of files) {
        if (fileRe && !fileRe.test(file)) continue;
        const lines = readFileSync(resolve(root, file), 'utf8').split('\n');
        lines.forEach((line, index) => {
          if (re.test(line))
            findings.push({
              id: rule.id,
              file,
              line: index + 1,
              text: line.trim().slice(0, 140),
              severity: rule.severity,
            });
        });
      }
    }
  }
  return findings;
}

function main(argv) {
  const [cmd = 'validate', ...rest] = argv;
  if (cmd === 'validate') {
    const { errors, summary, copies } = runValidate();
    process.stdout.write(
      `anti-slop registry: ${JSON.stringify(summary)}; legacy prose copies: ${copies}\n`
    );
    if (errors.length) {
      process.stderr.write(errors.join('\n') + '\n');
      return 1;
    }
    process.stdout.write('anti-slop: ok\n');
    return 0;
  }
  if (cmd === 'list') {
    const scope = rest[rest.indexOf('--scope') + 1];
    for (const r of loadRegistry().rules) {
      if (scope && !r.scope.includes(scope)) continue;
      process.stdout.write(
        `${r.id}  ${r.enforcement.status.padEnd(9)} ${r.enforcement.kind.padEnd(13)} ${r.severity.padEnd(5)} ${r.title}\n`
      );
    }
    return 0;
  }
  if (cmd === 'check') {
    const files = rest.slice(rest.indexOf('--files') + 1);
    if (!files.length || rest.indexOf('--files') < 0) {
      process.stderr.write('usage: check --files <file...>\n');
      return 2;
    }
    const reg = loadRegistry();
    const findings = runMatchers(reg, files);
    const fs = spawnSync(
      process.execPath,
      [
        join(REPO_ROOT, 'scripts/design-frontend-skill-check.mjs'),
        '--files',
        ...files,
      ],
      { stdio: 'inherit' }
    );
    for (const f of findings)
      process.stderr.write(
        `${f.id} ${f.severity} ${f.file}:${f.line} ${f.text}\n`
      );
    return findings.some(f => f.severity === 'block') || fs.status ? 1 : 0;
  }
  if (cmd === 'legacy' && rest.includes('--write')) {
    const legacy = JSON.parse(
      readFileSync(join(REPO_ROOT, LEGACY_PATH), 'utf8')
    );
    const keep = legacy.files.filter(f => findUnregisteredCopies().includes(f));
    writeFileSync(
      join(REPO_ROOT, LEGACY_PATH),
      JSON.stringify({ ...legacy, files: keep }, null, 2) + '\n'
    );
    return 0;
  }
  process.stderr.write(`unknown command ${cmd}\n`);
  return 2;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1])
  process.exitCode = main(process.argv.slice(2));
