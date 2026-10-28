import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Guard (security triage 2026-10-25, codex t13 F1): an exported server action
 * is a public endpoint whose arguments are attacker-controlled at runtime;
 * TypeScript parameter types are not validation. An exported function in a
 * 'use server' module must never spread or pass one of its own parameters
 * straight into a DB write (`.set({...updates})`, `.set(updates)`,
 * `.values({...input})`). Build the write from an explicit allowlist or a
 * strict zod parse instead.
 */
const ROOT = process.cwd();

/**
 * Known violations being fixed elsewhere. Do not add entries; fix the action.
 * - updateCreatorProfile: explicit field list lands in #22882.
 */
const KNOWN_VIOLATIONS = new Set([
  'app/app/(shell)/dashboard/actions/creator-profile.ts#updateCreatorProfile:updates',
]);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) return [];
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)
      ? [path]
      : [];
  });
}

const EXPORTED_FN =
  /export\s+(?:async\s+)?function\s+(\w+)\s*(?:<[^>]*>)?\s*\(([\s\S]*?)\)\s*(?::[^{]*)?\{/g;

function paramNames(params: string): string[] {
  // Top-level parameter names only: `name:` / `name?:` / `name,` / `name =`.
  const names: string[] = [];
  let depth = 0;
  let token = '';
  for (const char of `${params},`) {
    if ('{[(<'.includes(char)) depth++;
    if ('}])>'.includes(char)) depth--;
    if (char === ',' && depth === 0) {
      const match = token.trim().match(/^(\w+)\s*\??\s*(?:[:=]|$)/);
      if (match) names.push(match[1]);
      token = '';
    } else {
      token += char;
    }
  }
  return names;
}

function findMassAssignment(source: string): string[] {
  if (
    !/^\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*['"]use server['"]/.test(source)
  )
    return [];
  const hits: string[] = [];
  const matches = [...source.matchAll(EXPORTED_FN)];
  matches.forEach((match, index) => {
    const start = (match.index ?? 0) + match[0].length;
    const end = matches[index + 1]?.index ?? source.length;
    const body = source.slice(start, end);
    for (const name of paramNames(match[2])) {
      const write = new RegExp(
        `\\.(?:set|values)\\(\\s*(?:\\{\\s*\\.\\.\\.${name}\\b|${name}\\s*\\))`
      );
      if (write.test(body)) hits.push(`${match[1]}:${name}`);
    }
  });
  return hits;
}

describe('server actions never mass-assign request input', () => {
  it('detects the pattern', () => {
    const sample = `'use server';
export async function save(id: string, updates: Partial<{ a: string }>) {
  await db.update(t).set({ ...updates, updatedAt: new Date() });
}
export async function ok(input: { a: string }) {
  await db.update(t).set({ a: input.a });
}`;
    expect(findMassAssignment(sample)).toEqual(['save:updates']);
    expect(findMassAssignment(sample.replace("'use server';", ''))).toEqual([]);
  });

  it('has no new violations', () => {
    const found: string[] = [];
    for (const file of ['app', 'lib'].flatMap(dir =>
      sourceFiles(join(ROOT, dir))
    )) {
      for (const hit of findMassAssignment(readFileSync(file, 'utf8'))) {
        found.push(`${relative(ROOT, file)}#${hit}`);
      }
    }
    expect(found.filter(hit => !KNOWN_VIOLATIONS.has(hit))).toEqual([]);
  });
});
