import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(
  join(process.cwd(), 'styles/design-system.css'),
  'utf8'
);

describe('desktop profile identity name', () => {
  it('wraps the display name in the fixed identity column instead of truncating', () => {
    const rule = css.match(
      /\[data-testid="profile-identity-link"\]\s*>\s*span\s*\{([^}]*)\}/
    );
    expect(rule, 'missing desktop name wrap rule').not.toBeNull();
    expect(rule?.[1]).toContain('white-space: normal');
    expect(rule?.[1]).toContain('text-overflow: clip');
  });
});
