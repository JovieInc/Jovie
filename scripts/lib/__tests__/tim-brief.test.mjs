import { describe, expect, it } from 'vitest';

import { formatTimBrief } from '../../hermes/lib/tim-brief.ts';

describe('formatTimBrief', () => {
  it('returns empty string for no items', () => {
    expect(formatTimBrief([])).toBe('');
  });

  it('formats each item as problem/action/default/reply with no inline refs', () => {
    const text = formatTimBrief([
      {
        problem: 'The invoice sync stalled.',
        action: 'Check Stripe dashboard for the retry queue.',
        defaultAction: 'Left as-is — it retries automatically in an hour.',
        ref: 'billing_sync_stall',
      },
    ]);

    expect(text).toContain('1. The invoice sync stalled.');
    expect(text).toContain(
      'Action: Check Stripe dashboard for the retry queue.'
    );
    expect(text).toContain(
      'Default: Left as-is — it retries automatically in an hour.'
    );
    expect(text).toContain('Reply: Do this / Skip / Defer');
    // The code must not appear next to the problem line — only in the footer.
    expect(text.split('\n')[0]).not.toContain('billing_sync_stall');
    expect(text).toContain('Refs: billing_sync_stall');
  });

  it('caps at 3 items by default, reports the deferred count, and only footnotes shown refs', () => {
    const items = Array.from({ length: 5 }, (_, i) => ({
      problem: `Problem ${i + 1}`,
      action: `Action ${i + 1}`,
      defaultAction: `Default ${i + 1}`,
      ref: `code-${i + 1}`,
    }));

    const text = formatTimBrief(items);

    expect(text).toContain('1. Problem 1');
    expect(text).toContain('2. Problem 2');
    expect(text).toContain('3. Problem 3');
    expect(text).not.toContain('4. Problem 4');
    expect(text).not.toContain('5. Problem 5');
    expect(text).toContain('(+2 more deferred — reply "more" to see them.)');
    // Deferred items 4 and 5 have no visible problem statement, so their
    // codes must not leak into the footer either.
    expect(text).toContain('Refs: code-1, code-2, code-3');
  });

  it('does not print a deferred line when the item count exactly matches the cap', () => {
    const items = Array.from({ length: 3 }, (_, i) => ({
      problem: `Problem ${i + 1}`,
      action: `Action ${i + 1}`,
      defaultAction: `Default ${i + 1}`,
    }));

    const text = formatTimBrief(items);

    expect(text).not.toContain('deferred');
  });

  it('dedupes repeated ref codes in the footer', () => {
    const text = formatTimBrief([
      {
        problem: 'Problem 1',
        action: 'Action 1',
        defaultAction: 'Default 1',
        ref: 'dup_code',
      },
      {
        problem: 'Problem 2',
        action: 'Action 2',
        defaultAction: 'Default 2',
        ref: 'dup_code',
      },
    ]);

    expect(text).toContain('Refs: dup_code');
    expect(text).not.toContain('dup_code, dup_code');
  });

  it('honors a custom maxItems and an optional title', () => {
    const items = Array.from({ length: 2 }, (_, i) => ({
      problem: `Problem ${i + 1}`,
      action: `Action ${i + 1}`,
      defaultAction: `Default ${i + 1}`,
    }));

    const text = formatTimBrief(items, { maxItems: 1, title: 'Heads up' });

    expect(text.startsWith('Heads up\n\n1. Problem 1')).toBe(true);
    expect(text).not.toContain('2. Problem 2');
    expect(text).toContain('(+1 more deferred — reply "more" to see them.)');
  });

  it('omits the Refs line when no item has a ref', () => {
    const text = formatTimBrief([
      {
        problem: 'Something needs attention.',
        action: 'Take a look.',
        defaultAction: 'Nothing happens.',
      },
    ]);

    expect(text).not.toContain('Refs:');
  });
});
