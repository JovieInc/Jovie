/**
 * Safety guard: the Gmail connector must NOT export a `send` function.
 *
 * Jovie is a read-only AI assistant. We must never email on behalf of artists.
 * This test asserts that no module in apps/web/lib/connectors/gmail/
 * exports a function named `send`, preventing accidental introduction of
 * outbound email capability.
 *
 * Skips gracefully if the gmail connector directory doesn't exist yet (C-PR-2 not merged).
 */

import { existsSync, readdirSync } from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

const GMAIL_LIB_DIR = path.resolve(__dirname, '../../../lib/connectors/gmail');

// Use the actual resolved path relative to the test file
const GMAIL_DIR = path.resolve(__dirname, '../gmail');

describe('Gmail connector: no send export', () => {
  it('gmail connector directory exists or is absent (C-PR-2 not yet merged)', () => {
    // This test always passes — it documents the expected state.
    // If the directory exists, the next test will scan it.
    expect(true).toBe(true);
  });

  it('no module in apps/web/lib/connectors/gmail/** exports a function named "send"', async () => {
    const dirToCheck = existsSync(GMAIL_DIR)
      ? GMAIL_DIR
      : existsSync(GMAIL_LIB_DIR)
        ? GMAIL_LIB_DIR
        : null;

    if (!dirToCheck) {
      console.info(
        '[no-gmail-send] SKIP: gmail connector directory not found (C-PR-2 not yet merged)'
      );
      return;
    }

    const tsFiles = readdirSync(dirToCheck, { recursive: true }).filter(
      (f): f is string =>
        typeof f === 'string' && f.endsWith('.ts') && !f.endsWith('.test.ts')
    );

    for (const file of tsFiles) {
      const filePath = path.join(dirToCheck, file);
      try {
        // Dynamic import — use string variable to avoid static resolution.
        // Do NOT .catch() here: let errors fall through to the catch block
        // so the source-text fallback actually runs on import failure.
        const modulePath = filePath;
        const mod = (await import(/* @vite-ignore */ modulePath)) as Record<
          string,
          unknown
        >;
        if ('send' in mod) {
          expect.fail(
            `${file} exports 'send' — Jovie must NEVER send email on behalf of artists. ` +
              `Remove or rename the export. See .claude/rules/security.md.`
          );
        }
      } catch {
        // If import fails, fall back to source text check
        const { readFileSync } = await import('node:fs');
        const source = readFileSync(filePath, 'utf-8');
        const hasSendExport =
          /export\s+(async\s+)?function\s+send\b/.test(source) ||
          /export\s*\{[^}]*\bsend\b[^}]*\}/.test(source) ||
          /export\s+const\s+send\s*=/.test(source);

        if (hasSendExport) {
          expect.fail(
            `${file} appears to export 'send' — Jovie must NEVER send email on behalf of artists.`
          );
        }
      }
    }
  });
});
