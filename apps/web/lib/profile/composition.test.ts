import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  getProfileCardShapeClassName,
  PROFILE_CARD_FOOTER_ANCHOR_CLASSNAME,
  PROFILE_HERO_COMPOSITION_CLASSNAME,
  PROFILE_HERO_MIN_HEIGHT_CLASSNAME,
  PROFILE_HERO_MIN_HEIGHT_PX,
} from './composition';

const GLOBALS_CSS = join(process.cwd(), 'app', 'globals.css');

/**
 * Contract tests for the profile composition layer (GitHub #11899).
 * These lock the deterministic rules: hero crop + floor, fixed card shapes,
 * bottom-anchored CTA — so instance refactors cannot drift back to
 * content-driven heights.
 */
describe('profile composition layer', () => {
  it('keeps the hero floor at 240px and on the 4px spacing scale', () => {
    expect(PROFILE_HERO_MIN_HEIGHT_PX).toBe(240);
    // min-h-60 = 60 × 4px = 240px — the classname and the px constant must
    // never drift apart.
    expect(PROFILE_HERO_MIN_HEIGHT_CLASSNAME).toBe('min-h-60');
  });

  it('composes the hero from a fixed 16/7 crop plus the floor', () => {
    expect(PROFILE_HERO_COMPOSITION_CLASSNAME).toContain('aspect-hero');
    expect(PROFILE_HERO_COMPOSITION_CLASSNAME).toContain(
      PROFILE_HERO_MIN_HEIGHT_CLASSNAME
    );
    expect(PROFILE_HERO_COMPOSITION_CLASSNAME).toContain('w-full');
  });

  it('maps every card shape to a fixed aspect-ratio utility', () => {
    expect(getProfileCardShapeClassName('compact')).toBe('aspect-square');
    expect(getProfileCardShapeClassName('standard')).toBe(
      'aspect-card-standard'
    );
    expect(getProfileCardShapeClassName('wide')).toBe('aspect-video');
  });

  it('anchors card footers to the bottom edge', () => {
    expect(PROFILE_CARD_FOOTER_ANCHOR_CLASSNAME).toContain('mt-auto');
    expect(PROFILE_CARD_FOOTER_ANCHOR_CLASSNAME).toContain('shrink-0');
  });

  it('registers the composition aspect tokens in the Tailwind theme', () => {
    const globals = readFileSync(GLOBALS_CSS, 'utf8');

    expect(globals).toMatch(/--aspect-hero:\s*16\s*\/\s*7\s*;/);
    expect(globals).toMatch(/--aspect-card-standard:\s*4\s*\/\s*5\s*;/);
  });
});
