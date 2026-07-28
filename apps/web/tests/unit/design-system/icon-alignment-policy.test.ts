import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const WEB_ROOT = join(import.meta.dirname, '..', '..', '..');
const REPO_ROOT = join(WEB_ROOT, '..', '..');

const design = readFileSync(join(REPO_ROOT, 'DESIGN.md'), 'utf8');
const uiRule = readFileSync(join(REPO_ROOT, '.claude/rules/ui.md'), 'utf8');

describe('icon and text alignment policy (JOV-4511)', () => {
  it('keeps geometric centering as the default for arbitrary web SVGs', () => {
    for (const source of [design, uiRule]) {
      expect(source).toMatch(
        /geometric center(?:ing)? is the (?:web )?default/i
      );
      expect(source).toMatch(/arbitrary (?:web )?SVG/i);
    }
  });

  it('limits baseline alignment and optical correction to evidence-backed shared ownership', () => {
    for (const source of [design, uiRule]) {
      expect(source).toMatch(
        /baseline alignment only when both.*compatible.*baseline/i
      );
      expect(source).toMatch(/1–2px optical correction/i);
      expect(source).toMatch(
        /screenshot evidence.*both (?:light and dark )?themes/i
      );
      expect(source).toMatch(/shared primitive, helper, (?:or )?token/i);
      expect(source).toMatch(/call-site margin or translate/i);
      expect(source).toMatch(/preserve.*hit.target.*geometry/i);
      expect(source).toMatch(/must not appear on hover|never a hover effect/i);
    }
  });
});
