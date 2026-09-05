#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const ASSIGNMENT = /^([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/u;

function findClosingQuote(value, quote) {
  let escaped = false;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (quote === '"' && character === '\\' && !escaped) {
      escaped = true;
      continue;
    }
    if (character === quote && !escaped) return true;
    escaped = false;
  }
  return false;
}

/**
 * Extract only variable names from a systemd-style EnvironmentFile.
 *
 * Values are intentionally never returned or included in errors. Quoted values
 * may span physical lines, so continuation data can never be mistaken for a
 * diagnostic row.
 */
export function environmentVariableNames(contents) {
  if (typeof contents !== 'string') {
    throw new TypeError('environment file must be text');
  }

  const names = [];
  let quote = null;
  for (const physicalLine of contents.split(/\r?\n/u)) {
    if (quote) {
      if (findClosingQuote(physicalLine, quote)) quote = null;
      continue;
    }

    const line = physicalLine.trimStart();
    if (line.length === 0 || line.startsWith('#') || line.startsWith(';')) {
      continue;
    }

    const assignment = ASSIGNMENT.exec(line);
    if (!assignment) {
      throw new Error('malformed environment assignment');
    }
    names.push(assignment[1]);

    const value = assignment[2].trimStart();
    const opening = value[0];
    if (
      (opening === '"' || opening === "'") &&
      !findClosingQuote(value.slice(1), opening)
    ) {
      quote = opening;
    }
  }

  if (quote) throw new Error('unterminated quoted environment assignment');
  return names;
}

export function renderEnvironmentVariableNameDiagnostics(contents) {
  const names = environmentVariableNames(contents);
  if (names.length === 0) return '';
  return `${names.map(name => `environment_variable_name=${name}`).join('\n')}\n`;
}

/**
 * @param {string[]} args
 * @param {{
 *   read?: (path: string) => Promise<string>,
 *   writeOut?: (value: string) => void,
 *   writeError?: (value: string) => void,
 * }} dependencies
 */
export async function runEnvironmentVariableNameDiagnostics(
  args,
  {
    read = path => readFile(path, 'utf8'),
    writeOut = value => process.stdout.write(value),
    writeError = value => process.stderr.write(value),
  } = {}
) {
  if (args.length !== 1) {
    writeError('usage: symphony-environment-file-names <environment-file>\n');
    return 64;
  }

  try {
    const contents = await read(args[0]);
    writeOut(renderEnvironmentVariableNameDiagnostics(contents));
    return 0;
  } catch {
    writeError('environment_file_diagnostic=unavailable\n');
    return 1;
  }
}

const entrypoint = process.argv[1];
if (entrypoint && import.meta.url === pathToFileURL(entrypoint).href) {
  process.exitCode = await runEnvironmentVariableNameDiagnostics(
    process.argv.slice(2)
  );
}
