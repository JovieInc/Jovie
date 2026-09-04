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
