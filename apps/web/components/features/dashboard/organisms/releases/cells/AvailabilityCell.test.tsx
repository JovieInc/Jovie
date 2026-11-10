import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const webRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../../..'
);

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

  it('keeps the trigger accessible name anchored by the sr-only prefix (WCAG 2.5.3)', () => {
    const source = readFileSync(
      resolve(
        webRoot,
        'components/features/dashboard/organisms/releases/cells/AvailabilityCell.tsx'
      ),
      'utf8'
    );

    // The sr-only prefix leads the name and the visible rail text follows:
    // no shadowing aria-label on the trigger.
    expect(source).toContain(
      "<span className='sr-only'>Show provider availability details:</span>"
    );
    expect(source).not.toMatch(
      /aria-label='Show Provider Availability Details'/
    );
  });
});
