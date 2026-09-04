import { describe, expect, it } from 'vitest';
import {
  collectSwiftSource,
  collectWebProductSource,
  formatViolations,
  jsxOpenings,
  lineOf,
  read,
  repoPath,
  type Violation,
} from './blocking-ui-invariants';

/**
 * one-primary-action-per-screen-v1 (Tim lock 2026-08-30,
 * gbrain ops/reviewed-invariants/blocking-ui-invariants-v1).
 *
 * Every screen has exactly ONE primary action. Extra primaries are red.
 * iOS: one top-right action or an actions menu, never two buttons.
 *
 * Web detector (source contract, fail closed): a single product TSX surface
 * that renders two or more primary-variant Button-family CTAs is a violation.
 * Screens compose from these surfaces, so a surface that already carries two
 * static primaries can never satisfy the screen-level invariant (live miss:
 * the investor brief renders a nav primary AND a hero primary at once).
 * A surface whose primaries live in mutually exclusive branches still fails:
 * extract each branch into its own component — a screen file carrying two
 * primary CTAs cannot be audited for the one-primary invariant, and this
 * contract does not guess at branch reachability.
 *
 * iOS detector: a SwiftUI view file that declares two or more trailing
 * toolbar items (`.topBarTrailing` / `.navigationBarTrailing`) is a
 * violation — the invariant allows one top-right action or one actions Menu.
 *
 * No baseline, no allowlist. Specimen/gallery surfaces (component galleries
 * under app/ui, /dev/, /demo/, /storybook/) are not screens and are excluded;
 * everything else that ships is in scope.
 */

const SPECIMEN_SURFACE = /\/(app\/ui|dev|demo|storybook)\//;
const PRIMARY_BUTTON_TAG = /(?:[A-Za-z][\w.]*)?Button/;
const PRIMARY_VARIANT = /variant=\{?['"]primary['"]\}?/;
const IOS_TRAILING_TOOLBAR_ITEM =
  /ToolbarItem\s*\(\s*placement:\s*\.(?:topBarTrailing|navigationBarTrailing)/g;

describe('one-primary-action-per-screen-v1', () => {
  it('web: product surfaces expose at most one primary CTA', () => {
    const files = collectWebProductSource().filter(
      file => !SPECIMEN_SURFACE.test(repoPath(file))
    );
    expect(files.length).toBeGreaterThan(0);

    const violations: Violation[] = [];
    for (const file of files) {
      const source = read(file);
      if (!PRIMARY_VARIANT.test(source)) continue;
      const primaries = jsxOpenings(source, PRIMARY_BUTTON_TAG).filter(
        opening => PRIMARY_VARIANT.test(opening.attrs)
      );
      if (primaries.length > 1) {
        const lines = primaries
          .map(opening => `L${lineOf(source, opening.index)}`)
          .join(', ');
        violations.push({
          file: repoPath(file),
          detail:
            `${primaries.length} primary-variant CTAs (${lines}); ` +
            'a screen gets exactly one primary action',
        });
      }
    }

    expect
      .soft(
        violations,
        formatViolations('one-primary-action-per-screen-v1', violations)
      )
      .toEqual([]);
    expect(violations).toHaveLength(0);
  });

  it('iOS: top-right toolbar has at most one action', () => {
    const files = collectSwiftSource('ios');
    expect(files.length).toBeGreaterThan(0);

    const violations: Violation[] = [];
    for (const file of files) {
      const source = read(file);
      const trailing = source.match(IOS_TRAILING_TOOLBAR_ITEM) ?? [];
      if (trailing.length > 1) {
        violations.push({
          file: repoPath(file),
          detail:
            `${trailing.length} trailing toolbar items; ` +
            'collapse into one action or one Menu',
        });
      }
    }

    expect(
      violations,
      formatViolations('one-primary-action-per-screen-v1 (iOS)', violations)
    ).toEqual([]);
  });
});
