import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

interface ButtonSurfaceClassManifest {
  readonly maxRemaining: number;
  readonly remaining: readonly string[];
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = join(__dirname, '..', '..', '..');
const MANIFEST_PATH = join(__dirname, 'button-surface-classes-remaining.json');
const DESIGN_SYSTEM_CSS = join(WEB_ROOT, 'styles', 'design-system.css');
const RUNTIME_SOURCE_DIRS = ['app', 'components'].map(dir =>
  join(WEB_ROOT, dir)
);

const SOURCE_EXT = /\.(tsx|ts|css)$/;
const BUTTON_SURFACE_CLASS = /\bsystem-b-[a-z0-9-]*button(?:--[a-z0-9-]+)?\b/g;

function readManifest(): ButtonSurfaceClassManifest {
  return JSON.parse(
    readFileSync(MANIFEST_PATH, 'utf8')
  ) as ButtonSurfaceClassManifest;
}

function walk(dir: string, out: string[]): void {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const s = statSync(full);
    if (s.isDirectory()) {
      if (entry === 'node_modules' || entry === '.next') continue;
      walk(full, out);
    } else if (SOURCE_EXT.test(entry)) {
      out.push(full);
    }
  }
}

function findButtonSurfaceClasses(file: string): readonly string[] {
  return Array.from(
    new Set(readFileSync(file, 'utf8').match(BUTTON_SURFACE_CLASS) ?? [])
  ).sort();
}

describe('Button canonicalization ratchet', () => {
  it('keeps the remaining class manifest shrink-only', () => {
    const manifest = readManifest();
    expect(
      manifest.remaining.length,
      `button-surface-classes-remaining.json lists ${manifest.remaining.length} classes; maxRemaining is ${manifest.maxRemaining}.`
    ).toBeLessThanOrEqual(manifest.maxRemaining);
  });

  it('does not add system-b button classes to runtime TSX sources', () => {
    const manifest = readManifest();
    const allowed = new Set(manifest.remaining);
    const files: string[] = [];
    for (const dir of RUNTIME_SOURCE_DIRS) walk(dir, files);

    const violations = files.flatMap(file =>
      findButtonSurfaceClasses(file)
        .filter(className => !allowed.has(className))
        .map(className => `${relative(WEB_ROOT, file)}: ${className}`)
    );

    expect(violations).toEqual([]);
  });

  it('does not add system-b button classes to design-system.css', () => {
    const manifest = readManifest();
    const allowed = new Set(manifest.remaining);
    const violations = findButtonSurfaceClasses(DESIGN_SYSTEM_CSS).filter(
      className => !allowed.has(className)
    );

    expect(violations).toEqual([]);
  });
});
