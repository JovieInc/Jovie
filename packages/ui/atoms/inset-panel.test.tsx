import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as React from 'react';
import { describe, expect, it, vi } from 'vitest';

import {
  MENU_ITEM_BASE,
  MENU_LEADING_SLOT_BASE,
  MENU_TRAILING_SLOT_BASE,
  OVERLAY_ITEM_RADIUS,
} from '../lib/dropdown-styles';
import {
  INSET_PANEL_GUTTER,
  INSET_PANEL_ICON_COLUMN,
  INSET_PANEL_ROW_LAYOUT,
  INSET_PANEL_TRAILING,
} from '../lib/inset-panel-styles';
import { expectNoA11yViolations } from '../test-utils/a11y';
import {
  InsetPanel,
  InsetPanelHeader,
  InsetPanelProgress,
  InsetPanelRow,
  InsetPanelSectionLabel,
  InsetPanelSeparator,
} from './inset-panel';

function classes(element: Element | null): string[] {
  return (element?.getAttribute('class') ?? '').split(/\s+/).filter(Boolean);
}

const COUNT_SLOTS = [
  'inset-panel-meta',
  'inset-panel-header-trailing',
  'inset-panel-trailing',
] as const;

function CountSlots({ value }: { value: React.ReactNode }) {
  return (
    <>
      <InsetPanelHeader title='Queue' meta={value} trailing={value} />
      <InsetPanelRow trailing={value}>Pending changes</InsetPanelRow>
    </>
  );
}

describe('InsetPanel', () => {
  it('renders an evenly inset surface and forwards its ref', () => {
    const ref = React.createRef<HTMLElement>();
    render(
      <InsetPanel ref={ref} data-testid='panel'>
        content
      </InsetPanel>
    );
    const panel = screen.getByTestId('panel');
    expect(ref.current).toBe(panel);
    expect(panel).toHaveAttribute('data-slot', 'inset-panel');
    expect(panel).toHaveAttribute('data-tone', 'plain');
    expect(classes(panel)).toEqual(
      expect.arrayContaining(['p-1', 'border', 'bg-surface-elevated'])
    );
    expect(classes(panel)).not.toContain('bg-linear-to-br');
    expect(InsetPanel.displayName).toBe('InsetPanel');
  });

  it('builds the gradient tone from design tokens only', () => {
    render(<InsetPanel tone='gradient' data-testid='panel' />);
    const panel = screen.getByTestId('panel');
    expect(panel).toHaveAttribute('data-tone', 'gradient');
    expect(classes(panel)).toEqual(
      expect.arrayContaining([
        'bg-surface-elevated',
        'bg-linear-to-br',
        'from-accent-subtle',
        'to-transparent',
      ])
    );
  });

  it('merges onto a semantic child with asChild', () => {
    render(
      <InsetPanel asChild>
        <section aria-label='Getting started'>content</section>
      </InsetPanel>
    );
    const region = screen.getByRole('region', { name: 'Getting started' });
    expect(region.tagName).toBe('SECTION');
    expect(region).toHaveAttribute('data-slot', 'inset-panel');
  });

  it('shares the menu gutter, icon column and trailing slot', () => {
    // The panel and CommonDropdown must stay on one optical contract.
    for (const token of [OVERLAY_ITEM_RADIUS, 'gap-2']) {
      expect(MENU_ITEM_BASE.split(' ')).toContain(token);
      expect(INSET_PANEL_ROW_LAYOUT.split(' ')).toContain(token);
    }
    // Same 10px gutter: the menu row spells it px-2.5, the panel uses the
    // matching spacing token so no new off-grid literal is added.
    expect(MENU_ITEM_BASE.split(' ')).toContain('px-2.5');
    expect(INSET_PANEL_GUTTER).toBe('px-(--space-2-5)');
    expect(INSET_PANEL_ROW_LAYOUT.split(' ')).toContain(INSET_PANEL_GUTTER);
    expect(INSET_PANEL_ICON_COLUMN).toContain(MENU_LEADING_SLOT_BASE);
    expect(INSET_PANEL_TRAILING).toContain(MENU_TRAILING_SLOT_BASE);
  });

  it('lays a row out as icon column, label and trailing slot', () => {
    render(
      <InsetPanelRow icon={<svg data-testid='icon' />} trailing='G then S'>
        Settings
      </InsetPanelRow>
    );
    const label = screen.getByText('Settings');
    const row = label.closest('[data-slot="inset-panel-row"]');
    expect(row).not.toBeNull();
    expect(classes(row)).toEqual(
      expect.arrayContaining(['h-8', 'px-(--space-2-5)'])
    );
    expect(classes(row)).not.toContain('hover:bg-surface-1');
    const slots = Array.from(row?.children ?? []).map(child =>
      child.getAttribute('data-slot')
    );
    expect(slots).toEqual([
      'inset-panel-icon',
      'inset-panel-label',
      'inset-panel-trailing',
    ]);
    const iconColumn = screen.getByTestId('icon').parentElement;
    expect(iconColumn).toHaveAttribute('aria-hidden', 'true');
    expect(classes(iconColumn)).toEqual(
      expect.arrayContaining(['w-4', 'shrink-0', 'justify-center'])
    );
    expect(classes(screen.getByText('G then S'))).toEqual(
      expect.arrayContaining(['ms-auto', 'text-tertiary-token'])
    );
  });

  it('keeps the icon column when a row has no icon so labels stay aligned', () => {
    render(<InsetPanelRow>Full changelog</InsetPanelRow>);
    const row = screen
      .getByText('Full changelog')
      .closest('[data-slot="inset-panel-row"]');
    expect(row?.firstElementChild).toHaveAttribute(
      'data-slot',
      'inset-panel-icon'
    );
  });

  it('makes the child control the row with asChild', () => {
    render(
      <InsetPanelRow asChild icon={<svg />} trailing='⌘ /'>
        <a href='/changelog'>Release notes</a>
      </InsetPanelRow>
    );
    const link = screen.getByRole('link', { name: /Release notes/ });
    expect(link).toHaveAttribute('data-slot', 'inset-panel-row');
    expect(link).toHaveAttribute('href', '/changelog');
    expect(classes(link)).toEqual(
      expect.arrayContaining(['h-8', 'px-(--space-2-5)', 'hover:bg-surface-1'])
    );
    expect(link.querySelector('a, button')).toBeNull();
  });

  it('renders a native button row when given onClick', async () => {
    const onClick = vi.fn();
    render(
      <InsetPanelRow icon={<svg />} onClick={onClick}>
        Restart to update
      </InsetPanelRow>
    );
    const button = screen.getByRole('button', { name: 'Restart to update' });
    expect(button).toHaveAttribute('type', 'button');
    expect(button).toHaveAttribute('data-slot', 'inset-panel-row');
    expect(classes(button)).toEqual(
      expect.arrayContaining(['h-8', 'px-(--space-2-5)', 'hover:bg-surface-1'])
    );
    expect(button.querySelector('a, button')).toBeNull();
    await userEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('disables a button row', async () => {
    const onClick = vi.fn();
    render(
      <InsetPanelRow onClick={onClick} disabled>
        Restart to update
      </InsetPanelRow>
    );
    const button = screen.getByRole('button', { name: 'Restart to update' });
    expect(button).toBeDisabled();
    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('renders a header with a title, muted meta and a trailing control', () => {
    render(
      <InsetPanelHeader
        title='Getting started'
        meta='0 of 6'
        trailing={<button type='button'>Dismiss</button>}
      />
    );
    expect(classes(screen.getByText('Getting started'))).toContain(
      'text-primary-token'
    );
    expect(classes(screen.getByText('0 of 6'))).toEqual(
      expect.arrayContaining(['text-tertiary-token', 'tabular-nums'])
    );
    expect(screen.getByRole('button', { name: 'Dismiss' })).toBeVisible();
  });

  it.each(COUNT_SLOTS)('shows numeric zero in %s', slot => {
    const { container } = render(<CountSlots value={0} />);
    expect(container.querySelector(`[data-slot="${slot}"]`)).toHaveTextContent(
      '0'
    );
  });

  it('keeps counts visible as values become zero and omits empty slots', () => {
    const { container, rerender } = render(<CountSlots value={7} />);
    const assertSlots = (text: string | null) => {
      for (const slot of COUNT_SLOTS) {
        const element = container.querySelector(`[data-slot="${slot}"]`);
        if (text === null) expect(element).toBeNull();
        else expect(element).toHaveTextContent(text);
      }
    };
    assertSlots('7');
    for (const value of [null, undefined, false, '']) {
      rerender(<CountSlots value={value} />);
      assertSlots(null);
    }
    rerender(<CountSlots value={0} />);
    assertSlots('0');
    rerender(<CountSlots value={7} />);
    assertSlots('7');
  });

  it('renders a muted section label, a separator and a named progress bar', () => {
    render(
      <InsetPanel>
        <InsetPanelSectionLabel>What&apos;s new</InsetPanelSectionLabel>
        <InsetPanelSeparator />
        <InsetPanelProgress value={50} label='Setup progress' />
      </InsetPanel>
    );
    expect(classes(screen.getByText("What's new"))).toEqual(
      expect.arrayContaining(['h-8', 'px-(--space-2-5)', 'text-tertiary-token'])
    );
    expect(screen.getByRole('separator')).toHaveAttribute(
      'data-slot',
      'inset-panel-separator'
    );
    const progress = screen.getByRole('progressbar', {
      name: 'Setup progress',
    });
    expect(progress).toHaveAttribute('aria-valuenow', '50');
  });

  it('has no accessibility violations', async () => {
    const { container } = render(
      <InsetPanel asChild tone='gradient'>
        <section aria-label='Getting started'>
          <InsetPanelHeader title='Getting started' meta='1 of 3' />
          <InsetPanelProgress value={33} label='Setup progress' />
          <InsetPanelRow asChild icon={<svg />}>
            <a href='/connect'>Connect imported tools</a>
          </InsetPanelRow>
          <InsetPanelRow icon={<svg />} trailing='⌘ /'>
            Keyboard shortcuts
          </InsetPanelRow>
        </section>
      </InsetPanel>
    );
    await expectNoA11yViolations(container);
  });
});
