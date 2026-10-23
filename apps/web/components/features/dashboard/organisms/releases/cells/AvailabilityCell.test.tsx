import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

/**
 * Token-compliance contract (Ion tokens only, no raw palette colors):
 * the manual-status ring and the copied-state feedback ride Noir Ion
 * tokens — never raw amber/emerald/orange utilities.
 */
describe('AvailabilityCell token compliance', () => {
  it('keeps status and copied feedback on Ion tokens, never raw palette colors', () => {
    const source = readFileSync(
      resolve(
        webRoot,
        'components/features/dashboard/organisms/releases/cells/AvailabilityCell.tsx'
      ),
      'utf8'
    );

    expect(source).not.toMatch(/emerald-|amber-|orange-|cyan-/);
    expect(source).toContain("'ring-2 ring-quaternary-token/40'");
    expect(source).toContain("isCopied && 'text-success'");
  });
});
