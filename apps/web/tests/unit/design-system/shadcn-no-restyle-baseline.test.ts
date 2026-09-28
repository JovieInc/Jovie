/**
 * Shrink-only ratchet for shadcn/no-restyle grandfathered call sites.
 * The JSON is the reviewable baseline. This test never writes it.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = join(__dirname, '..', '..', '..');
const BASELINE_PATH = join(__dirname, 'shadcn-no-restyle.baseline.json');
const ESLINT_CONFIG_PATH = join(WEB_ROOT, 'eslint.config.js');

/**
 * Ship-time ceilings. Growth fails; shrink is allowed.
 *
 * Raised 2026-09-25 (+3 files / +24 messages) for three pre-existing-on-main
 * files (FilterSubmenu.tsx, ReleaseProviderMatrixNotices.tsx,
 * ChannelIntelligencePanel.tsx) surfaced by an unrelated banned-icon edit
 * under this rule's whole-file lint; see the baseline JSON's `generatedBy`
 * note for the per-file justification.
 */
const MAX_FILES_CEILING = 240;
const MAX_MESSAGES_CEILING = 3282;

interface ShadcnNoRestyleBaseline {
  readonly generatedBy: string;
  readonly maxFiles: number;
  readonly maxMessages: number;
  readonly files: Readonly<Record<string, number>>;
}

function readBaseline(): ShadcnNoRestyleBaseline {
  return JSON.parse(
    readFileSync(BASELINE_PATH, 'utf8')
  ) as ShadcnNoRestyleBaseline;
}

describe('shadcn/no-restyle shrink-only baseline', () => {
  it('is enrolled in the live ESLint config and cannot silently grow', () => {
    const config = readFileSync(ESLINT_CONFIG_PATH, 'utf8');
    expect(config).toContain('shadcn-no-restyle.baseline.json');
    expect(config).toContain('shadcnNoRestyleBaselineFiles');

    const baseline = readBaseline();
    const files = Object.keys(baseline.files);
    const messageCount = Object.values(baseline.files).reduce(
      (sum, count) => sum + count,
      0
    );

    expect(baseline.generatedBy).toMatch(/shrink-only/);
    expect(files).toEqual([...files].sort((a, b) => a.localeCompare(b)));
    expect(files.length).toBe(baseline.maxFiles);
    expect(messageCount).toBe(baseline.maxMessages);
    expect(baseline.maxFiles).toBeLessThanOrEqual(MAX_FILES_CEILING);
    expect(baseline.maxMessages).toBeLessThanOrEqual(MAX_MESSAGES_CEILING);

    for (const [relativePath, count] of Object.entries(baseline.files)) {
      expect(count, relativePath).toBeGreaterThan(0);
      expect(
        existsSync(join(WEB_ROOT, relativePath)),
        `missing ${relativePath}`
      ).toBe(true);
    }
  });
});
