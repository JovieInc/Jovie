import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// Class guard from the Mac dogfood agent (JOV-9018): a hard-coded plural noun
// after an interpolated count renders "1 Items". Counted labels go through
// pluralize() in lib/utils/pluralize.ts.
const COUNTED_PLURAL =
  /[}]\s+(Items|Contacts|Fans|Profiles|Releases|Tracks|Messages|Chats|Subscribers|Members|Results|Links|Files|Notes)\b/;

// Ratchet: known violators that other open work is rewriting. An entry that
// no longer violates fails the test so the list can only shrink.
const KNOWN_VIOLATIONS = new Set([
  // JOV-9018; being rewritten by the Inbox/shell PRs (#22972, #22998, #23003).
  'components/shell/SidebarInboxLink.tsx',
]);

function productSources(): string[] {
  const root = process.cwd();
  const out = execFileSync(
    'git',
    [
      'ls-files',
      'components',
      'app',
      'lib',
      ':!:**/*.test.*',
      ':!:**/*.stories.*',
    ],
    { cwd: root, encoding: 'utf8' }
  );
  return out
    .split('\n')
    .filter(f => /\.(tsx|ts)$/.test(f))
    .map(f => path.join(root, f));
}

describe('counted labels agree with their count', () => {
  it('has no hard-coded plural noun after an interpolated count', async () => {
    const { readFileSync } = await import('node:fs');
    const violators = productSources()
      .filter(file => COUNTED_PLURAL.test(readFileSync(file, 'utf8')))
      .map(file => path.relative(process.cwd(), file));
    const unexpected = violators.filter(f => !KNOWN_VIOLATIONS.has(f));
    const stale = [...KNOWN_VIOLATIONS].filter(f => !violators.includes(f));
    expect({ unexpected, stale }).toEqual({ unexpected: [], stale: [] });
  });

  it('the pattern catches the observed defects and spares fixed labels', () => {
    expect(COUNTED_PLURAL.test('{visibleCount} of {totalCount} Items')).toBe(
      true
    );
    expect(COUNTED_PLURAL.test('`Inbox ${n} Items Need Attention`')).toBe(true);
    expect(COUNTED_PLURAL.test("{pluralize(totalCount, 'Item')}")).toBe(false);
    expect(COUNTED_PLURAL.test('All Items')).toBe(false);
  });
});
