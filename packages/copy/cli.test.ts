import { describe, expect, it } from 'vitest';
import { extractCopy, registerFor } from './cli';

describe('PR delta gate extraction', () => {
  it('maps only customer-facing paths', () => {
    expect(registerFor('apps/web/data/homepageV2Copy.ts')).toBe(
      'jovie-marketing'
    );
    expect(registerFor('apps/web/lib/email/templates/welcome.tsx')).toBe(
      'jovie-transactional'
    );
    expect(registerFor('apps/web/content/legal/terms.md')).toBeUndefined();
    expect(registerFor('docs/PR_FLOW.md')).toBeUndefined();
  });

  it('pulls copy out of code and skips class lists and paths', () => {
    expect(extractCopy(`  headline: 'Leverage your fans.',`, 'x.ts')).toEqual([
      'Leverage your fans.',
    ]);
    expect(extractCopy(`className="flex items-center gap-2"`, 'x.tsx')).toEqual(
      []
    );
    expect(extractCopy(`<p>Out now everywhere</p>`, 'x.tsx')).toContain(
      'Out now everywhere'
    );
  });
});
