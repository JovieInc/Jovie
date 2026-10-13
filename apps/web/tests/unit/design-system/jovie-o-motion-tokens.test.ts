import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  JOVIE_O_EASE_TOKENS,
  JOVIE_O_MOTION_TOKENS,
} from '@jovie/ui/brand/jovie-o-motion';
import { describe, expect, it } from 'vitest';

const css = readFileSync(
  path.resolve(__dirname, '../../../styles/design-system.css'),
  'utf8'
);

/** First declaration of a custom property, following var() aliases. */
function resolve(token: string, seen = new Set<string>()): string {
  const match = new RegExp(`${token}:\\s*([^;]+);`).exec(css);
  if (!match) throw new Error(`${token} is not declared in design-system.css`);
  const value = match[1].trim();
  const alias = /^var\((--[\w-]+)\)$/.exec(value);
  if (alias && !seen.has(alias[1])) {
    seen.add(alias[1]);
    return resolve(alias[1], seen);
  }
  return value;
}

describe('living O motion tokens (JOV-7760)', () => {
  it.each(Object.entries(JOVIE_O_MOTION_TOKENS))(
    '%s in design-system.css equals the JS mirror',
    (token, ms) => {
      expect(resolve(token)).toBe(`${ms}ms`);
    }
  );

  it.each(Object.entries(JOVIE_O_EASE_TOKENS))(
    '%s in design-system.css equals the JS mirror',
    (token, curve) => {
      expect(resolve(token)).toBe(curve);
    }
  );

  it('zeroes every brand-only duration under reduced motion', () => {
    const reduced = css.slice(
      css.indexOf('@media (prefers-reduced-motion: reduce) {\n  :root {')
    );
    for (const token of Object.keys(JOVIE_O_MOTION_TOKENS)) {
      if (token === '--duration-cinematic' || token === '--duration-slower')
        continue;
      expect(reduced).toContain(`${token}: 0ms;`);
    }
  });
});
