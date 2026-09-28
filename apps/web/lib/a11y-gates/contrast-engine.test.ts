import { describe, expect, it } from 'vitest';
import { extractRules } from './contrast-engine';

describe('extractRules', () => {
  it('reads the innermost rule when an at-rule wraps it', () => {
    const rules = extractRules(
      '@media (min-width: 1px) { .btn { --color: red; } }'
    );

    expect(rules).toHaveLength(1);
    expect(rules[0]?.selector).toBe('.btn');
    expect(rules[0]?.declarations.get('--color')).toBe('red');
    expect(rules[0]?.atContext).toContain('@media');
  });
});
