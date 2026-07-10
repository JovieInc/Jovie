import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * JOV-3532 — Source guard: ban off-token radius/padding magic numbers on
 * composer + header surfaces.
 *
 * Fail when scoped files introduce:
 * - numeric `borderRadius: N` literals (must use SYSTEM_B_RADIUS_PX / CSS vars)
 * - arbitrary Tailwind radius `rounded-[…]`
 * - arbitrary spacing `p-[…]` / `px-[…]` / `py-[…]` / `pt|pb|pl|pr-[…]`
 *
 * Escape hatch (same line or previous line):
 *   // system-b-allow: <reason> (JOV-XXXX)
 * or JSX `{/* system-b-allow: <reason> *\/}`
 *
 * Extend the scoped globs carefully — widen only when a surface has already
 * been cleaned of un-allowlisted violations.
 */

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

const EXPLICIT_FILES = [
  'components/jovie/components/ChatInput.tsx',
  'components/jovie/components/ChatComposerToolbar.tsx',
  'components/jovie/components/chat-motion.ts',
  'components/marketing/HomeComposerHero.tsx',
  'lib/design/system-b-radius.ts',
] as const;

const SHELL_DIR = resolve(appRoot, 'components/shell');

const FORBIDDEN = [
  {
    id: 'numeric-borderRadius',
    pattern: /borderRadius\s*:\s*\d+/,
    message:
      'numeric borderRadius literal — use SYSTEM_B_RADIUS_PX.<token> or var(--radius-*)',
  },
  {
    id: 'arbitrary-rounded',
    pattern: /\brounded-\[[^\]]+\]/,
    message:
      'arbitrary rounded-[…] — use named System B radius utilities (rounded-md, rounded-3xl, rounded-full, …)',
  },
  {
    id: 'arbitrary-padding',
    pattern: /\b(?:p|px|py|pt|pb|pl|pr)-\[[^\]]+\]/,
    message:
      'arbitrary padding-[…] — use spacing-scale utilities or CSS vars (e.g. pb-(--system-b-chat-composer-thread-scroll-padding))',
  },
] as const;

const ALLOW_RE = /system-b-allow\s*:/;

function listShellTsx(dir: string): string[] {
  const out: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry === '__tests__' || entry === 'node_modules') continue;
    const full = join(dir, entry);
    let stats: ReturnType<typeof statSync>;
    try {
      stats = statSync(full);
    } catch {
      continue;
    }
    if (stats.isDirectory()) {
      out.push(...listShellTsx(full));
    } else if (
      stats.isFile() &&
      (entry.endsWith('.tsx') || entry.endsWith('.ts')) &&
      !entry.endsWith('.test.tsx') &&
      !entry.endsWith('.test.ts')
    ) {
      out.push(full);
    }
  }
  return out;
}

function isAllowed(line: string, prevLine: string | undefined): boolean {
  if (ALLOW_RE.test(line)) return true;
  if (prevLine && ALLOW_RE.test(prevLine)) return true;
  return false;
}

function scanFile(absPath: string): string[] {
  const rel = relative(appRoot, absPath);
  const source = readFileSync(absPath, 'utf8');
  const lines = source.split('\n');
  const offenders: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const prev = i > 0 ? lines[i - 1] : undefined;
    // Skip pure allowlist comment lines themselves.
    if (ALLOW_RE.test(line) && !FORBIDDEN.some(f => f.pattern.test(line))) {
      continue;
    }
    for (const rule of FORBIDDEN) {
      if (!rule.pattern.test(line)) continue;
      if (isAllowed(line, prev)) continue;
      offenders.push(
        `${rel}:${i + 1} [${rule.id}] ${rule.message}\n  ${line.trim()}`
      );
    }
  }

  return offenders;
}

describe('composer + header radius/padding source guard (JOV-3532)', () => {
  const files = [
    ...EXPLICIT_FILES.map(rel => resolve(appRoot, rel)),
    ...listShellTsx(SHELL_DIR),
  ];

  it('has scoped files to scan', () => {
    expect(files.length).toBeGreaterThan(EXPLICIT_FILES.length);
  });

  it('bans off-token radius/padding magic numbers without system-b-allow', () => {
    const offenders: string[] = [];
    for (const file of files) {
      offenders.push(...scanFile(file));
    }

    expect(
      offenders,
      `Off-token radius/padding on composer/header surfaces:\n${offenders.join('\n')}\n\nFix by using SYSTEM_B_RADIUS_PX / spacing tokens, or add // system-b-allow: <reason> (JOV-XXXX) on the previous line.`
    ).toEqual([]);
  });

  it('exports the System B radius pixel map for geometry helpers', () => {
    const source = readFileSync(
      resolve(appRoot, 'lib/design/system-b-radius.ts'),
      'utf8'
    );
    expect(source).toContain('SYSTEM_B_RADIUS_PX');
    expect(source).toContain("'3xl': 24");
    expect(source).toContain('pill: 9999');
  });

  it('keeps ChatInput + HomeComposerHero geometry on SYSTEM_B_RADIUS_PX', () => {
    for (const rel of [
      'components/jovie/components/ChatInput.tsx',
      'components/marketing/HomeComposerHero.tsx',
    ] as const) {
      const source = readFileSync(resolve(appRoot, rel), 'utf8');
      expect(source).toContain('SYSTEM_B_RADIUS_PX');
      expect(source).not.toMatch(/borderRadius\s*:\s*\d+/);
    }
  });
});
