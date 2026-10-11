import { globSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const webRoot = resolve(import.meta.dirname, '../../..');

// Extensions the Playwright artifact guard can classify. Anything else in a
// failed attempt's output dir is reported as `unknown-binary`, which fails
// the whole Storybook step even when the suite passes on retry.
const SCANNABLE_EXTENSION = /\.(?:png|json|jsonl|md)$/;

/**
 * Collect the depth-1 string/template literals inside the argument list that
 * starts at `openParen` (index of the `(`).
 */
function argumentLiterals(source: string, openParen: number): string[] {
  const literals: string[] = [];
  let depth = 0;
  let index = openParen;
  while (index < source.length) {
    const char = source[index];
    if (char === '(') depth += 1;
    else if (char === ')') {
      depth -= 1;
      if (depth === 0) return literals;
    } else if (depth === 1 && (char === "'" || char === '"' || char === '`')) {
      const quote = char;
      const start = index;
      index += 1;
      while (index < source.length) {
        if (source[index] === '\\') index += 2;
        else if (source[index] === quote) break;
        else index += 1;
      }
      literals.push(source.slice(start + 1, index));
    }
    index += 1;
  }
  return literals;
}

function staticTail(literal: string) {
  return literal.replace(/\$\{[^}]*\}/g, '');
}

describe('Storybook Playwright attachment names', () => {
  it('keeps every attach() name on a guard-scannable extension', () => {
    const files = globSync('tests/e2e/storybook-*.spec.ts', {
      cwd: webRoot,
    }).sort();
    expect(files.length).toBeGreaterThan(0);

    const offenders: string[] = [];
    for (const file of files) {
      const source = readFileSync(join(webRoot, file), 'utf8');
      for (const match of source.matchAll(/\battach[\w]*\(/g)) {
        const openParen = match.index + match[0].length - 1;
        for (const literal of argumentLiterals(source, openParen)) {
          // MIME types such as 'image/png' are options, not file names.
          if (literal.includes('/')) continue;
          const tail = staticTail(literal);
          if (tail && !SCANNABLE_EXTENSION.test(tail)) {
            offenders.push(`${file}: attach name ${JSON.stringify(literal)}`);
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
