/**
 * Claude Code PreToolUse hook for mcp__pencil__execute (JOV-9246, ASR-040).
 * Refuses (exit 2) a structural Pen edit that targets a node inside any
 * component the census says has instances; snapshots the .pen file first when
 * it allows a structural edit. No census for the file: warn, never block.
 *
 * Install: scripts/agent/pen-guard-install.sh (copies this hook, the guard lib
 * and the census tool to ~/.claude/hooks and wires settings.json).
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const CENSUS_DIR =
  process.env.PEN_CENSUS_DIR || join(homedir(), '.cache', 'pen-census');

export function censusPathFor(filePath, dir = CENSUS_DIR) {
  return join(
    dir,
    `${createHash('sha1').update(filePath).digest('hex').slice(0, 10)}.json`
  );
}

/** The script text an execute call will run: its snippet, or the replacements of a patch. */
export function scriptOf(toolInput) {
  if (typeof toolInput?.input === 'string') return toolInput.input;
  if (Array.isArray(toolInput?.edits))
    return toolInput.edits.map(e => e.replace ?? '').join('\n');
  return '';
}

export async function evaluateHook(
  event,
  { dir = CENSUS_DIR, snapshotDir, guard } = {}
) {
  const lib = guard ?? (await import(pathToFileURL(findGuard()).href));
  const filePath = event?.tool_input?.filePath;
  const script = scriptOf(event?.tool_input);
  if (!script || lib.classifyOps(script).propertyOnly) return { code: 0 };
  const censusFile = filePath ? censusPathFor(filePath, dir) : null;
  if (!censusFile || !existsSync(censusFile)) {
    return {
      code: 0,
      warn: `pen-guard: structural edit but no instance census for ${filePath ?? '(no file)'}; not blocking. Run pen-census.mjs to enable the guard.`,
    };
  }
  const census = JSON.parse(readFileSync(censusFile, 'utf8'));
  const result = lib.decideWithCensus({
    script,
    census,
    file: filePath,
    snapshotDir,
  });
  if (!result.allowed) return { code: 2, block: result.reason };
  const age = Math.round((Date.now() - (census.generatedAt ?? 0)) / 60000);
  return {
    code: 0,
    note: `pen-guard: ok${result.snapshot ? `; snapshot ${result.snapshot}` : ''}; census ${age} min old`,
  };
}

function findGuard() {
  const here = fileURLToPath(new URL('.', import.meta.url));
  for (const candidate of [
    join(here, 'pen-structural-guard.mjs'),
    join(homedir(), '.claude', 'hooks', 'pen-structural-guard.mjs'),
  ]) {
    if (existsSync(candidate)) return candidate;
  }
  throw new Error('pen-structural-guard.mjs not found next to the hook');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  let raw = '';
  for await (const chunk of process.stdin) raw += chunk;
  let out;
  try {
    out = await evaluateHook(JSON.parse(raw));
  } catch (error) {
    process.stderr.write(
      `pen-guard: hook error (${error.message}); not blocking\n`
    );
    process.exit(0);
  }
  if (out.block) process.stderr.write(`${out.block}\n`);
  else if (out.warn) process.stderr.write(`${out.warn}\n`);
  else if (out.note) process.stderr.write(`${out.note}\n`);
  process.exitCode = out.code;
}
