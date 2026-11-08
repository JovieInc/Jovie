import { readFileSync } from 'node:fs';
import path from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AppShellRightRail } from '../AppShellRightRail';

const foundation = () =>
  readFileSync(
    path.resolve(__dirname, '../../../styles/tailwind-foundation.css'),
    'utf8'
  );

function railUtility() {
  const css = foundation();
  const start = css.indexOf('@utility shell-inspector-rail');
  expect(start).toBeGreaterThan(-1);
  return css.slice(start, css.indexOf('\n}\n', start) + 2);
}

describe('AppShellRightRail', () => {
  it('is an in-flow desktop column that pushes the route instead of overlaying it', () => {
    render(
      <AppShellRightRail className='fixture-rail'>
        <div data-testid='fixture-panel'>Panel body</div>
      </AppShellRightRail>
    );
    const rail = screen.getByTestId('app-shell-right-rail');
    expect(rail).toHaveAttribute('aria-label', 'Context Panel');
    expect(rail).toHaveAttribute('data-rail-preview-region', 'right');
    expect(rail).toHaveClass(
      'shell-inspector-rail',
      'pointer-events-none',
      'fixture-rail'
    );
    expect(rail).not.toHaveClass('shell-inspector-overlay');
    expect(rail).toContainElement(screen.getByTestId('fixture-panel'));
    expect(screen.getByTestId('fixture-panel').parentElement).toHaveClass(
      'pointer-events-auto',
      'h-full'
    );

    // Desktop geometry: an in-flow, non-shrinking column with the shared gap.
    const utility = railUtility();
    const desktop = utility.slice(
      utility.indexOf('@media (min-width: 1024px)')
    );
    const base = desktop.slice(0, desktop.indexOf('&:has('));
    expect(base).not.toContain('position: absolute');
    expect(base).toContain('flex: none;');
    expect(base).toContain('height: 100%;');
    expect(base).toContain('width: auto;');
    // No gap until a drawer is phased in: a slot whose drawer has not
    // mounted yet (a lazily loaded panel) must not narrow the route.
    expect(base).toContain('padding-inline-start: 0;');
    expect(base).not.toContain('padding-inline-start: var(--app-shell-gap);');
    // Same half-plane cap as the drawer so the pushed route keeps a column.
    expect(base).toContain('max-width: 50cqw;');
  });

  it('gives the gap back with the drawer and floats only a requested preview', () => {
    const utility = railUtility();
    // The gap exists only while a drawer is opening or open, so a closed or
    // not-yet-mounted rail allocates nothing and the route keeps the plane.
    expect(utility).toMatch(
      /&:has\(\[data-rail-phase="open"\], \[data-rail-phase="opening"\]\)\s*\{\s*padding-inline-start: var\(--app-shell-gap\);/
    );
    // Only a drawer that requests the transient overlay floats; the slot
    // then allocates no width (clamped to 0, the inset margin cancels its
    // padding), and entering that clamp snaps so a preview never nudges.
    expect(utility).toMatch(
      /&:has\(\[data-rail-presentation="overlay"\]:not\(\[data-rail-phase="closed"\]\)\)\s*\{\s*max-width: 0;\s*margin-inline-start: calc\(var\(--space-1-5\) \* -1\);\s*padding-inline: 0 var\(--space-1-5\);/
    );
    expect(utility).toMatch(
      /@media \(prefers-reduced-motion: no-preference\)\s*\{\s*transition-property:\s*flex-basis, width, border-width, margin, padding, opacity,\s*transform;/
    );
    expect(utility).toMatch(
      /padding-block-start: calc\(\s*var\(--app-shell-header-height\) \+\s*var\(--space-1-5\)\s*\);/
    );
  });

  it('keeps an overlay preview below the shell header only when one exists', () => {
    const { rerender } = render(
      <AppShellRightRail belowHeader>
        <div>Panel</div>
      </AppShellRightRail>
    );
    expect(screen.getByTestId('app-shell-right-rail')).toHaveAttribute(
      'data-rail-below-header',
      'true'
    );
    rerender(
      <AppShellRightRail>
        <div>Panel</div>
      </AppShellRightRail>
    );
    expect(screen.getByTestId('app-shell-right-rail')).not.toHaveAttribute(
      'data-rail-below-header'
    );
  });

  it('retains shared motion without clipping the viewport mobile adapter', () => {
    render(
      <AppShellRightRail>
        <div>Panel</div>
      </AppShellRightRail>
    );
    expect(screen.getByTestId('app-shell-right-rail')).toHaveClass(
      'shell-inspector-rail',
      'transition-shell-rail-allocation',
      'motion-reduce:transition-none'
    );
    // Below lg the slot is a 0x0 anchor that never clips the portaled sheet.
    const utility = railUtility();
    const mobile = utility.slice(0, utility.indexOf('@media'));
    expect(mobile).toMatch(/height: 0;\s*width: 0;\s*overflow: visible;/);
  });
});
