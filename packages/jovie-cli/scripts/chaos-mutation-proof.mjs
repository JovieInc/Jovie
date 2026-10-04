#!/usr/bin/env node
/**
 * Deliberate-red proof for the chaos gate (JOV-7714).
 *
 * The script reintroduces each known regression class into a copy of the
 * built CLI and requires chaos-blackbox to fail on the matching scenario. If
 * a mutant's anchor no longer matches the build, the proof is stale and fails
 * too, so the gate cannot pass silently against changed code.
 *
 *   node chaos-mutation-proof.mjs --dist <dist dir>
 */
import { spawnSync } from 'node:child_process';
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

export const MUTANTS = [
  {
    name: 'stack trace on a closed pipe',
    file: 'cli.js',
    from: "process.stdout.on('error', onClosedPipe);",
    to: '',
    scenario: 'closed-stdout-pipe',
  },
  {
    name: 'stack trace on a request failure',
    file: 'cli.js',
    from: 'writeLine(stderr, payload.message);',
    to: 'writeLine(stderr, error instanceof Error ? error.stack : payload.message);',
    scenario: 'artist-not-found',
  },
  {
    name: 'hang without a request deadline',
    file: 'client.js',
    from: 'AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS)',
    to: 'new AbortController().signal',
    scenario: 'hang-before-headers',
  },
  {
    name: 'secret leaked into diagnostics',
    file: 'client.js',
    from: 'return value.replace(',
    to: 'return value || value.replace(',
    scenario: 'injected-escapes-and-secrets',
  },
];

const here = dirname(fileURLToPath(import.meta.url));

export function applyMutant(source, mutant) {
  const count = source.split(mutant.from).length - 1;
  if (count !== 1) {
    throw new Error(
      `Stale proof: "${mutant.name}" anchor matched ${count} times in ${mutant.file}. Update MUTANTS for the new build.`
    );
  }
  return source.replace(mutant.from, mutant.to);
}

function main() {
  const { values } = parseArgs({ options: { dist: { type: 'string' } } });
  if (!values.dist) {
    console.error('Usage: chaos-mutation-proof.mjs --dist <dist dir>');
    process.exit(2);
  }
  const dist = resolve(values.dist);
  let failed = 0;
  for (const mutant of MUTANTS) {
    const root = mkdtempSync(join(tmpdir(), 'jovie-chaos-mutant-'));
    try {
      cpSync(dist, root, { recursive: true });
      const target = join(root, mutant.file);
      writeFileSync(target, applyMutant(readFileSync(target, 'utf8'), mutant));
      const report = join(root, 'report.json');
      const gate = spawnSync(
        process.execPath,
        [
          join(here, 'chaos-blackbox.mjs'),
          '--bin',
          join(root, 'cli.js'),
          '--only',
          mutant.scenario,
          '--report',
          report,
        ],
        { encoding: 'utf8', timeout: 120_000 }
      );
      const caught =
        gate.status === 1 &&
        JSON.parse(readFileSync(report, 'utf8')).failed.some(
          entry => entry.name === mutant.scenario
        );
      console.log(
        `${caught ? 'blocked' : 'MISSED '} ${mutant.name} (${mutant.scenario})`
      );
      if (!caught) {
        failed += 1;
        console.log(gate.stdout, gate.stderr);
      }
    } catch (error) {
      failed += 1;
      console.log(`ERROR   ${mutant.name}: ${error.message}`);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
  console.log(
    `\nchaos-mutation-proof: ${MUTANTS.length - failed}/${MUTANTS.length} regressions blocked`
  );
  process.exit(failed ? 1 : 0);
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main();
}
