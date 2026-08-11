#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  closeSync,
  mkdtempSync,
  openSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
} from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildPenColdReadbackReceipt,
  exitCodeForPenColdReadback,
  mapPenCliFailure,
  PEN_COLD_READBACK_SCHEMA,
  parseComponentListing,
} from './pen-cold-readback-lib.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const PROFILE_PATH = join(HERE, 'pen-workspace-locks.json');

// Read-only probe: app state plus every reusable component as `<id>::<name>`.
// save() is never sent; --out points at a disposable temp path.
const READBACK_SCRIPT = [
  'get_app_state({ include_schema: true })',
  'execute({ input: "Get(n=>n.reusable&&Print(n.id+\\"::\\"+n.name))" })',
  'exit()',
].join('\n');

function usage() {
  return (
    `Usage: node scripts/agent/pen-cold-readback.mjs (--profile <name> | --fixture <abs.pen>) [options]\n\n` +
    `Options: --pen-bin <path> (default: pen), --timeout-ms <n> (default: 120000),\n` +
    `--expect-component <id> (repeatable), --desktop-title <title>,\n` +
    `--desktop-dirty-state <clean|dirty|unknown>, --recorded-at <iso>.\n` +
    `Opens the target headlessly, reads reusable component metadata, never saves,\n` +
    `and emits a pen-cold-readback/v1 receipt. Canonical identity comes from\n` +
    `pen-workspace-locks.json; a fixture may never alias a protected path.\n`
  );
}

export function parseArgs(argv) {
  const input = { expectedComponents: [] };
  for (let index = 2; index < argv.length; index++) {
    const flag = argv[index];
    if (flag === '--help' || flag === '-h') return { help: true, input };
    const value = argv[++index];
    if (value === undefined) throw new Error(`${flag} requires a value.`);
    switch (flag) {
      case '--profile':
        input.workspaceProfile = value;
        break;
      case '--fixture':
        input.fixturePath = value;
        break;
      case '--pen-bin':
        input.penBin = value;
        break;
      case '--timeout-ms':
        input.timeoutMs = Number.parseInt(value, 10);
        if (!Number.isFinite(input.timeoutMs) || input.timeoutMs < 1000) {
          throw new Error('--timeout-ms must be an integer >= 1000.');
        }
        break;
      case '--expect-component':
        input.expectedComponents.push(value);
        break;
      case '--desktop-title':
        input.desktopTitle = value;
        break;
      case '--desktop-dirty-state':
        input.desktopDirtyState = value;
        break;
      case '--recorded-at':
        input.recordedAt = value;
        break;
      default:
        throw new Error(`Unknown argument: ${flag}`);
    }
  }
  return { help: false, input };
}

function resolveProfile(profileName) {
  const manifest = JSON.parse(readFileSync(PROFILE_PATH, 'utf8'));
  const profile = manifest.profiles?.[profileName];
  if (!profile)
    throw new Error(
      `Unknown Pen workspace profile: ${profileName || '<missing>'}`
    );
  const expandHome = path => path.replace(/^\$HOME(?=\/)/, homedir());
  const canonicalPath = expandHome(profile.canonical_path);
  return {
    canonicalPath,
    protectedPaths: [
      canonicalPath,
      ...(profile.read_only_paths ?? []).map(expandHome),
    ],
  };
}

function assertFixtureIsNotProtected(fixturePath, protectedPaths) {
  if (!isAbsolute(fixturePath) || !fixturePath.toLowerCase().endsWith('.pen')) {
    throw new Error(`Fixture must be an absolute .pen path: ${fixturePath}`);
  }
  const resolved = realpathSync(fixturePath);
  if (
    protectedPaths.some(
      candidate =>
        candidate.toLowerCase() === fixturePath.toLowerCase() ||
        candidate.toLowerCase() === resolved.toLowerCase()
    )
  ) {
    throw new Error(
      `Fixture may not alias a protected Pen document: ${fixturePath}`
    );
  }
  const fixtureStats = statSync(fixturePath);
  for (const candidate of protectedPaths) {
    try {
      const stats = statSync(candidate);
      if (stats.dev === fixtureStats.dev && stats.ino === fixtureStats.ino) {
        throw new Error(
          `Fixture may not hard-link a protected Pen document: ${fixturePath}`
        );
      }
    } catch (error) {
      if (error?.code === 'ENOENT') continue;
      throw error;
    }
  }
}

function sha256File(path) {
  const descriptor = openSync(path, 'r');
  try {
    return createHash('sha256').update(readFileSync(descriptor)).digest('hex');
  } finally {
    closeSync(descriptor);
  }
}

function runPenInteractive(penBin, targetPath, timeoutMs) {
  const outDir = mkdtempSync(join(tmpdir(), 'pen-cold-readback-'));
  try {
    const outPath = join(outDir, 'cold-readback-out.pen');
    const result = spawnSync(
      penBin,
      ['interactive', '--in', targetPath, '--out', outPath],
      { encoding: 'utf8', input: `${READBACK_SCRIPT}\n`, timeout: timeoutMs }
    );
    const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
    const typedReasons = mapPenCliFailure(output);
    if (result.error?.code === 'ETIMEDOUT') typedReasons.push('cli_timeout');
    if (result.error?.code === 'ENOENT') typedReasons.push('cli_unavailable');
    return {
      output,
      typedReasons: [...new Set(typedReasons)],
      cliExitCode:
        typeof result.status === 'number'
          ? result.status
          : result.error
            ? -1
            : 1,
    };
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
}

function main() {
  try {
    const { help, input } = parseArgs(process.argv);
    if (help) {
      process.stdout.write(usage());
      return;
    }
    const usingFixture = Boolean(input.fixturePath);
    if (usingFixture === Boolean(input.workspaceProfile)) {
      throw new Error('Exactly one of --profile or --fixture is required.');
    }
    const profile = resolveProfile(
      input.workspaceProfile ?? 'jovie-founder-design-studio'
    );
    const targetPath = usingFixture ? input.fixturePath : profile.canonicalPath;
    if (usingFixture) {
      assertFixtureIsNotProtected(targetPath, profile.protectedPaths);
    }

    const fileSha256Before = sha256File(targetPath);
    const run = runPenInteractive(
      input.penBin ?? 'pen',
      targetPath,
      input.timeoutMs ?? 120_000
    );
    const fileSha256After = sha256File(targetPath);

    const receipt = buildPenColdReadbackReceipt({
      mode: usingFixture ? 'fixture' : 'canonical',
      workspaceProfile: input.workspaceProfile,
      targetPath,
      fileSha256Before,
      fileSha256After,
      saveInvoked: false,
      components: parseComponentListing(run.output),
      typedReasons: run.typedReasons,
      cliExitCode: run.cliExitCode,
      expectedComponents: input.expectedComponents,
      desktopTitle: input.desktopTitle,
      desktopDirtyState: input.desktopDirtyState,
      recordedAt: input.recordedAt ?? new Date().toISOString(),
    });
    process.stdout.write(`${JSON.stringify(receipt)}\n`);
    process.exitCode = exitCodeForPenColdReadback(receipt);
  } catch (error) {
    process.stdout.write(
      `${JSON.stringify({
        schema: PEN_COLD_READBACK_SCHEMA,
        verdict: 'error',
        durability: 'not_proven',
        error: error instanceof Error ? error.message : String(error),
      })}\n`
    );
    process.exitCode = 2;
  }
}

main();
