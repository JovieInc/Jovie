import { describe, expect, it } from 'vitest';
import { safeJsonLdStringify } from '@/lib/utils/json-ld';

describe('safeJsonLdStringify', () => {
  it('escapes closing tag sequences with valid JSON escapes', () => {
    const serialized = safeJsonLdStringify({
      html: '</script><div>hi</div>',
    });

    expect(serialized).toContain(String.raw`\u003c/script>`);
    expect(() => JSON.parse(serialized)).not.toThrow();
    expect(JSON.parse(serialized)).toEqual({
      html: '</script><div>hi</div>',
    });
  });

  it('escapes html comment openings with valid JSON escapes', () => {
    const serialized = safeJsonLdStringify({
      comment: '<!-- hidden -->',
    });

    expect(serialized).toContain(String.raw`\u003c!-- hidden -->`);
    expect(() => JSON.parse(serialized)).not.toThrow();
    expect(JSON.parse(serialized)).toEqual({
      comment: '<!-- hidden -->',
    });
  });
});
