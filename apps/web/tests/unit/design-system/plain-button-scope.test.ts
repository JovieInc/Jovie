import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * PlainButton scope guard.
 *
 * PlainButton is the headless @jovie/ui button: it carries the shared button
 * behaviour and no look, so shadcn/no-restyle lets its callers style it (see
 * eslint-rules/shadcn-no-restyle.options.json). That exemption must not become
 * a way around Button's no-restyle contract, so only the files approved in
 * plain-button-scope.json may use it, and that list cannot grow past maxFiles.
 */

interface PlainButtonScope {
  readonly maxFiles: number;
  readonly files: readonly string[];
}

interface NoRestyleOptions {
  readonly contracts?: readonly {
    readonly pattern: string;
    readonly allow?: readonly string[];
    readonly deny?: readonly string[];
  }[];
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = join(__dirname, '..', '..', '..');
const SCOPE = JSON.parse(
  readFileSync(join(__dirname, 'plain-button-scope.json'), 'utf8')
) as PlainButtonScope;
const OPTIONS = JSON.parse(
  readFileSync(
    join(WEB_ROOT, 'eslint-rules', 'shadcn-no-restyle.options.json'),
    'utf8'
  )
) as NoRestyleOptions;

const PLAIN_BUTTON_USE = /\bPlainButton\b/;
const SOURCE_EXT = /\.(tsx|ts)$/;
const NON_PRODUCTION = /\.(test|spec|stories)\.[tj]sx?$/;

function walk(dir: string, out: string[]): void {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === 'node_modules' || entry === '.next') continue;
      walk(full, out);
    } else if (
      SOURCE_EXT.test(entry) &&
      !NON_PRODUCTION.test(entry) &&
      !full.includes(`${sep}__tests__${sep}`)
    ) {
      out.push(full);
    }
  }
}

function filesUsingPlainButton(): string[] {
  const files: string[] = [];
  for (const dir of ['app', 'components', 'lib'])
    walk(join(WEB_ROOT, dir), files);
  return files
    .filter(file => PLAIN_BUTTON_USE.test(readFileSync(file, 'utf8')))
    .map(file => relative(WEB_ROOT, file).split(sep).join('/'))
    .sort();
}

describe('PlainButton scope', () => {
  it('keeps the approved list within its ceiling and free of duplicates', () => {
    expect(SCOPE.files.length).toBeLessThanOrEqual(SCOPE.maxFiles);
    expect(new Set(SCOPE.files).size).toBe(SCOPE.files.length);
  });

  it('only lets approved files use PlainButton', () => {
    const approved = new Set(SCOPE.files);
    const unapproved = filesUsingPlainButton().filter(
      file => !approved.has(file)
    );
    expect(
      unapproved,
      'Use Button from @jovie/ui. PlainButton is only for the approved files in plain-button-scope.json.'
    ).toEqual([]);
  });

  it('exempts PlainButton, and nothing else, from no-restyle', () => {
    expect(OPTIONS.contracts).toEqual([
      { pattern: '^PlainButton$', allow: ['*'], deny: [] },
    ]);
  });
});
