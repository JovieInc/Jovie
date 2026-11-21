#!/usr/bin/env node
/**
 * CLI: health digest → durable gbrain claims.
 *
 *   node scripts/gbrain-compounding/run.mjs
 *   node scripts/gbrain-compounding/run.mjs --digest-file fixture.json
 *   node scripts/gbrain-compounding/run.mjs --dry-run
 *   node scripts/gbrain-compounding/run.mjs --buffer-dir /tmp/gbrain-compound
 *
 * Exit codes:
 *   0  compounded | dry-run | needs-probe (gbrain unavailable — explicit degrade)
 *   1  degraded write failure that is not a clean needs-probe, or invalid input
 *
 * When gbrain is live (CLI on PATH / JOVIE_GBRAIN_BIN), this writes:
 *   - ops/gbrain-health/latest
 *   - ops/gbrain-health/claims/<day>/*
 *   - ops/gbrain-health/claims/index
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { collectHealthDigest } from './digest.mjs';
import { compoundHealthDigest, createGbrainWriter } from './write.mjs';

/**
 * @param {string[]} argv
 */
export function parseArgs(argv) {
  const arg = (name, fallback = null) => {
    const i = argv.indexOf(`--${name}`);
    return i === -1 ? fallback : argv[i + 1];
  };
  return {
    digestFile: arg('digest-file'),
    bufferDir: arg('buffer-dir'),
    out: arg('out'),
    dryRun: argv.includes('--dry-run'),
    help: argv.includes('--help') || argv.includes('-h'),
  };
}

/**
 * @param {string[]} argv
 * @param {{
 *   collect?: typeof collectHealthDigest,
 *   compound?: typeof compoundHealthDigest,
 *   writer?: ReturnType<typeof createGbrainWriter>,
 *   env?: NodeJS.ProcessEnv,
 * }} [deps]
 */
export function runCompounding(argv, deps = {}) {
  const opts = parseArgs(argv);
  if (opts.help) {
    return {
      exitCode: 0,
      stdout: `Usage: node scripts/gbrain-compounding/run.mjs [--digest-file path] [--buffer-dir path] [--out path] [--dry-run]\n`,
      result: null,
    };
  }

  const collect = deps.collect ?? collectHealthDigest;
  const compound = deps.compound ?? compoundHealthDigest;

  let digest;
  if (opts.digestFile) {
    digest = JSON.parse(readFileSync(opts.digestFile, 'utf8'));
  } else {
    digest = collect();
  }

  const result = compound({
    digest,
    writer: deps.writer,
    bufferDir: opts.bufferDir,
    dryRun: opts.dryRun,
  });

  const summary = {
    schema: result.schema,
    status: result.status,
    reason: result.reason,
    generatedAt: result.digest.generatedAt,
    healthStatus: result.digest.status,
    claimCount: result.claims.length,
    writeOk: result.writes.filter(w => w.ok).length,
    writeFailed: result.writes.filter(w => !w.ok).length,
    buffered: result.buffered,
    claimSlugs: result.claims.map(c => c.slug),
  };

  if (opts.out) {
    writeFileSync(opts.out, `${JSON.stringify(result, null, 2)}\n`);
  }

  const exitCode =
    result.status === 'compounded' ||
    result.status === 'dry-run' ||
    result.status === 'needs-probe'
      ? 0
      : 1;

  return {
    exitCode,
    stdout: `${JSON.stringify(summary)}\n`,
    result,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const { exitCode, stdout } = runCompounding(process.argv.slice(2));
    process.stdout.write(stdout);
    process.exitCode = exitCode;
  } catch (err) {
    process.stderr.write(
      `${JSON.stringify({
        schema: 'jovie.gbrain-compounding-run/v1',
        status: 'error',
        reason: err instanceof Error ? err.message : String(err),
      })}\n`
    );
    process.exitCode = 1;
  }
}
