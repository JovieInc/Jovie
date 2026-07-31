import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  OVERLAY_CONTENT_RADIUS,
  OVERLAY_SURFACE_BASE,
  TOOLTIP_SURFACE_BASE,
} from '@jovie/ui/lib/dropdown-styles';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  PAGE_TOOLBAR_ACTION_BUTTON_CLASS,
  PAGE_TOOLBAR_TAB_ACTIVE_CLASS,
  PAGE_TOOLBAR_TAB_BUTTON_CLASS,
} from '@/components/organisms/table/molecules/PageToolbar';
import { NoirIonWorkspaceStatesSpecimen } from '@/components/organisms/table/NoirIonWorkspaceStatesSpecimen';
import {
  layoutStability,
  rowState,
} from '@/components/organisms/table/table.styles';
import { LINEAR_SURFACE } from '@/components/tokens/linear-surface';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = join(__dirname, '..', '..', '..');
const DESIGN_SYSTEM_CSS = readFileSync(
  join(WEB_ROOT, 'styles', 'design-system.css'),
  'utf8'
);

/** Extract the first `[data-app-shell-frame='true'] { ... }` block that owns Noir Ion D. */
function extractShellWorkspaceBlock(css: string): string {
  const marker = 'NOIR ION D — workspace state surfaces (shell-scoped)';
  const markerIndex = css.indexOf(marker);
  expect(markerIndex, 'Noir Ion D marker must exist').toBeGreaterThan(-1);
  const fromMarker = css.slice(markerIndex);
  const blockStart = fromMarker.search(/\[data-app-shell-frame=(['"])true\1\]/);
  expect(blockStart).toBeGreaterThan(-1);
  const openBrace = fromMarker.indexOf('{', blockStart);
  let depth = 0;
  for (let i = openBrace; i < fromMarker.length; i++) {
    const ch = fromMarker[i];
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        return fromMarker.slice(blockStart, i + 1);
      }
    }
  }
  throw new Error('Unclosed shell workspace block');
}

describe('Noir Ion D — workspace state surfaces (JOV-4648)', () => {
  const shellBlock = extractShellWorkspaceBlock(DESIGN_SYSTEM_CSS);

  it('contains shell-scoped Noir Ion anchors without writing them on :root', () => {
    expect(shellBlock).toContain(
      '--linear-row-hover: rgba(17, 175, 255, 0.06)'
    );
    expect(shellBlock).toContain(
      '--linear-row-selected: rgba(17, 175, 255, 0.1)'
    );
    expect(shellBlock).toContain(
      '--linear-border-focus: rgba(17, 175, 255, 0.72)'
    );
    expect(shellBlock).toContain('--color-bg-elevated: #151b2a');
    expect(shellBlock).toContain('--color-bg-tooltip: #1b2436');
    expect(shellBlock).toContain('--color-skeleton-base: #151b2a');
    expect(shellBlock).toContain('--linear-app-content-surface: #0a0d16');
    expect(shellBlock).toContain('--linear-bg-surface-1: #0f1420');

    // Global/public surfaces must not hardcode the same Noir anchors at :root.
    const rootBlocks = DESIGN_SYSTEM_CSS.match(
      /:root(?:\.dark)?\s*\{[\s\S]*?\n\}/g
    );
    expect(rootBlocks?.length).toBeGreaterThan(0);
    for (const block of rootBlocks ?? []) {
      expect(block).not.toContain('--linear-row-selected: rgba(17, 175, 255');
      expect(block).not.toContain('--color-bg-elevated: #151b2a');
      expect(block).not.toContain('--color-bg-tooltip: #1b2436');
    }
  });

  it('preserves table density and keyboard focus geometry', () => {
    expect(DESIGN_SYSTEM_CSS).toContain(
      ':where(.system-b-table-row-height) {\n  height: 40px;'
    );
    expect(layoutStability.rowHeight).toBe('40px');
    expect(layoutStability.skeletonRowHeight).toBe('40px');
    expect(rowState.hover).toBe('system-b-table-row-hover');
    expect(rowState.selected).toBe('system-b-table-row-selected');
    expect(rowState.focusVisible).toBe('system-b-table-row-focus-visible');
    expect(DESIGN_SYSTEM_CSS).toContain('background: var(--linear-row-hover);');
    expect(DESIGN_SYSTEM_CSS).toContain(
      'background: var(--linear-row-selected);'
    );
    expect(DESIGN_SYSTEM_CSS).toContain(
      'color-mix(in oklab, var(--linear-border-focus) 45%, transparent)'
    );
  });

  it('keeps PageToolbar on semantic surfaces (no layout/radius drift)', () => {
    expect(PAGE_TOOLBAR_TAB_BUTTON_CLASS).toContain('hover:bg-surface-1');
    expect(PAGE_TOOLBAR_TAB_ACTIVE_CLASS).toContain('bg-surface-1');
    expect(PAGE_TOOLBAR_ACTION_BUTTON_CLASS).toContain('hover:bg-surface-1');
    expect(PAGE_TOOLBAR_ACTION_BUTTON_CLASS).toContain(
      'focus-visible:bg-surface-1'
    );
    expect(PAGE_TOOLBAR_TAB_ACTIVE_CLASS).not.toContain('ring-');
  });

  it('routes overlays and tooltips through elevated/floating tokens', () => {
    expect(OVERLAY_SURFACE_BASE).toContain('bg-surface-elevated');
    expect(OVERLAY_SURFACE_BASE).toContain('shadow-popover');
    expect(TOOLTIP_SURFACE_BASE).toContain('bg-surface-tooltip');
    expect(OVERLAY_CONTENT_RADIUS).toBe('rounded-(--system-b-radius-overlay)');
    expect(LINEAR_SURFACE.popover).toContain('bg-surface-elevated');
    expect(LINEAR_SURFACE.drawerCard).toContain('bg-surface-1');
  });

  it('renders the compact specimen with reserved loading geometry', () => {
    render(<NoirIonWorkspaceStatesSpecimen />);

    const root = screen.getByTestId('noir-ion-workspace-states-specimen');
    expect(root).toHaveAttribute('data-app-shell-frame', 'true');

    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(
      screen.getByText('Selected row').closest('[data-state]')
    ).toHaveAttribute('data-state', 'selected');
    expect(
      screen.getByText('Focused row').closest('[data-state]')
    ).toHaveAttribute('data-state', 'focused');

    const skeleton = screen.getByTestId('noir-ion-specimen-skeleton');
    expect(skeleton).toHaveClass('skeleton', 'h-4', 'w-24');
    expect(skeleton.className).toMatch(/motion-reduce:animate-none/);

    expect(screen.getByTestId('noir-ion-specimen-popover')).toHaveClass(
      'bg-surface-elevated'
    );
    expect(screen.getByTestId('noir-ion-specimen-tooltip')).toHaveClass(
      'bg-surface-tooltip',
      'rounded-full'
    );
    expect(screen.getByTestId('noir-ion-specimen-drawer-card')).toHaveClass(
      'bg-surface-1'
    );
  });
});
