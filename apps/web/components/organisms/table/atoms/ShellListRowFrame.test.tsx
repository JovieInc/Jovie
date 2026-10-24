import { render, screen } from '@testing-library/react';
import type { KeyboardEvent } from 'react';
import { describe, expect, it } from 'vitest';
import {
  getShellListRowFrameClassName,
  ShellListRowButton,
  ShellListRowDisclosureIcon,
  ShellListRowFrame,
} from './ShellListRowFrame';

describe('ShellListRowFrame', () => {
  it('owns shell row chrome and density instead of requiring call-site class patches', () => {
    const className = getShellListRowFrameClassName({
      chrome: 'shell',
      density: 'standard',
      interactive: true,
    });

    expect(className).toContain('system-b-table-row-shell');
    expect(className).toContain('min-h-11');
    expect(className).toContain('py-1.5');
    expect(className).toContain('cursor-pointer');
  });

  it('defaults to plain chrome and caller-owned density for embedded rows', () => {
    const className = getShellListRowFrameClassName({});

    expect(className).not.toContain('system-b-table-row-shell');
    expect(className).not.toContain('min-h-');
    expect(className).not.toContain(' h-14');
  });

  it('uses shell row selection tokens for self-managed rows', () => {
    const { getByTestId } = render(
      <ShellListRowFrame
        data-testid='row'
        isSelected
        interactive
        className='h-14'
      />
    );

    const row = getByTestId('row');
    expect(row.tagName).toBe('DIV');
    expect(row).toHaveAttribute('data-shell-list-row', 'true');
    expect(row).toHaveAttribute('data-selected', 'true');
    expect(row.className).toContain('system-b-table-row-selected');
    expect(row.className).toContain('cursor-pointer');
    expect(row.className).toContain('h-14');
  });

  it('supports embedded rows that inherit focus from the table row wrapper', () => {
    const className = getShellListRowFrameClassName({
      interaction: 'task-row-group',
      isSelected: false,
    });

    expect(className).toContain('system-b-shell-list-task-row-hover');
    expect(className).not.toContain('cursor-pointer');
  });

  it('centralizes compact density and rejects legacy row hover styling', () => {
    const className = getShellListRowFrameClassName({ density: 'compact' });

    expect(className).toContain('min-h-7');
    expect(className).not.toContain('hover:text-accent');
  });

  it('uses button semantics for clickable shell rows', () => {
    const { getByTestId } = render(
      <ShellListRowButton data-testid='row-button' isSelected className='px-3'>
        Open
      </ShellListRowButton>
    );

    const row = getByTestId('row-button');
    expect(row.tagName).toBe('BUTTON');
    expect(row).toHaveAttribute('type', 'button');
    expect(row).toHaveAttribute('data-shell-list-row', 'true');
    expect(row).toHaveAttribute('data-selected', 'true');
    expect(row.className).toContain('system-b-table-row-selected');
    expect(row.className).toContain('cursor-pointer');
    expect(row.className).toContain('px-3');
  });

  it('renders a native li host for shell lists that own their rows', () => {
    render(
      <ShellListRowFrame
        as='li'
        aria-label='Row host'
        value={2}
        onKeyDown={(event: KeyboardEvent<HTMLLIElement>) => {
          void event.currentTarget.value;
        }}
      >
        <button type='button'>row control</button>
      </ShellListRowFrame>
    );

    const row = screen.getByRole('listitem', { name: 'Row host' });
    expect(row.tagName).toBe('LI');
    expect(row).not.toHaveAttribute('role');
    // `value` exists on li and not on div, so this stays a typecheck
    // regression for the host-specific props as well as a pass-through check.
    expect(row).toHaveProperty('value', 2);
    // Host props flow through so the caller's trigger wiring (Radix asChild
    // ref/handlers/global aria) lands on the row element itself.
    expect(row).toHaveAttribute('data-shell-list-row', 'true');
  });

  it('renders a shared disclosure chevron without local row icon chrome', () => {
    const { getByTestId } = render(
      <ShellListRowDisclosureIcon data-testid='disclosure' open />
    );

    const disclosure = getByTestId('disclosure');
    // jsdom exposes SVG className as an SVGAnimatedString, so read the
    // rendered class attribute directly (same pattern as other SVG asserts).
    const disclosureClassName = disclosure.getAttribute('class') ?? '';
    expect(disclosure).toHaveAttribute(
      'data-shell-list-row-disclosure',
      'true'
    );
    expect(disclosure).toHaveAttribute('data-state', 'open');
    expect(disclosureClassName).toContain('text-tertiary-token');
    expect(disclosureClassName).toContain('rotate-90');
    expect(disclosureClassName).not.toContain('rounded');
    expect(disclosureClassName).not.toContain('bg-');
  });
});
