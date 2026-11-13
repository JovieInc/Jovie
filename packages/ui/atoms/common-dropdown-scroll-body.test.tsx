import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { run as axe } from 'axe-core';
import { describe, expect, it, vi } from 'vitest';
import { MENU_MOTION_ANCHORED } from '../lib/dropdown-styles';
import { CommonDropdown } from './common-dropdown';
import {
  getMenuScrollEdges,
  getMenuScrollMask,
  getScrollBodyWidth,
  MENU_SCROLL_BODY,
  MENU_SCROLL_FADE_SIZE,
} from './common-dropdown-scroll-body';
import type { CommonDropdownItem } from './common-dropdown-types';

function historyItems(count: number): CommonDropdownItem[] {
  return Array.from({ length: count }, (_, index) => ({
    type: 'action' as const,
    id: `chat-${index}`,
    label: index === 3 ? 'Release Plan' : `Chat ${index}`,
    onClick: vi.fn(),
  }));
}

// aria-required-children is the open CommonDropdown benchmark gap (search
// textbox and status nodes inside role=menu; fix is the combobox + listbox
// rework in docs/design-system/component-benchmarks.json). Every other rule
// runs, so a new violation from the scroll body still fails here.
async function expectNoNewA11yViolations(element: Element) {
  const { violations } = await axe(element, {
    rules: { 'aria-required-children': { enabled: false } },
  });
  expect(violations.map(v => `${v.id}: ${v.nodes.map(n => n.html)}`)).toEqual(
    []
  );
}

function setScrollMetrics(
  element: HTMLElement,
  { scrollTop, scrollHeight, clientHeight }: Record<string, number>
) {
  Object.defineProperty(element, 'scrollHeight', {
    configurable: true,
    value: scrollHeight,
  });
  Object.defineProperty(element, 'clientHeight', {
    configurable: true,
    value: clientHeight,
  });
  element.scrollTop = scrollTop;
}

describe('getMenuScrollEdges', () => {
  it('reports only the bottom edge at the start of a long list', () => {
    expect(
      getMenuScrollEdges({ scrollTop: 0, scrollHeight: 900, clientHeight: 300 })
    ).toEqual({ top: false, bottom: true });
  });

  it('reports both edges in the middle', () => {
    expect(
      getMenuScrollEdges({
        scrollTop: 200,
        scrollHeight: 900,
        clientHeight: 300,
      })
    ).toEqual({ top: true, bottom: true });
  });

  it('drops the bottom edge at the end, with subpixel slack', () => {
    expect(
      getMenuScrollEdges({
        scrollTop: 599.5,
        scrollHeight: 900,
        clientHeight: 300,
      })
    ).toEqual({ top: true, bottom: false });
  });

  it('reports no edges when everything fits', () => {
    expect(
      getMenuScrollEdges({ scrollTop: 0, scrollHeight: 200, clientHeight: 300 })
    ).toEqual({ top: false, bottom: false });
  });
});

describe('getMenuScrollMask', () => {
  it('is undefined when nothing is clipped', () => {
    expect(getMenuScrollMask({ top: false, bottom: false })).toBeUndefined();
  });

  it('fades only the bottom edge while rows sit below', () => {
    expect(getMenuScrollMask({ top: false, bottom: true })).toBe(
      `linear-gradient(to bottom, transparent, black 0px, black calc(100% - ${MENU_SCROLL_FADE_SIZE}), transparent)`
    );
  });

  it('fades only the top edge once scrolled to the end', () => {
    expect(getMenuScrollMask({ top: true, bottom: false })).toBe(
      `linear-gradient(to bottom, transparent, black ${MENU_SCROLL_FADE_SIZE}, black calc(100% - 0px), transparent)`
    );
  });
});

describe('CommonDropdown scrollBody', () => {
  it('pins the search header outside the scrolling list', () => {
    render(
      <CommonDropdown
        items={historyItems(30)}
        open
        searchable
        scrollBody={MENU_SCROLL_BODY}
      />
    );

    const content = document.querySelector<HTMLElement>(
      '[data-slot="common-dropdown-content"]'
    );
    const body = document.querySelector<HTMLElement>(
      '[data-slot="common-dropdown-scroll-body"]'
    );
    const header = document.querySelector(
      '[data-slot="common-dropdown-search-header"]'
    );

    expect(content).toHaveAttribute('data-scroll-body', 'true');
    expect(content?.style.overflowY).toBe('hidden');
    expect(body).not.toBeNull();
    expect(body?.contains(header)).toBe(false);
    expect(body?.querySelectorAll('[role="menuitem"]')).toHaveLength(30);
  });

  it('gives the list a fixed width capped to the viewport', () => {
    render(
      <CommonDropdown
        items={historyItems(3)}
        open
        searchable
        scrollBody={MENU_SCROLL_BODY}
        minWidth={420}
      />
    );
    const content = document.querySelector<HTMLElement>(
      '[data-slot="common-dropdown-content"]'
    );
    expect(content?.style.width).toBe(getScrollBodyWidth(420));
    expect(content?.style.minWidth).toBe('');
    expect(getScrollBodyWidth(420)).toBe(
      'min(420px, calc(100vw - var(--space-8, 2rem)))'
    );
    expect(getScrollBodyWidth()).toBe(
      'min(25rem, calc(100vw - var(--space-8, 2rem)))'
    );
  });

  it('keeps the default menu as one scrolling surface with fade motion', () => {
    render(<CommonDropdown items={historyItems(5)} open searchable />);
    const content = document.querySelector<HTMLElement>(
      '[data-slot="common-dropdown-content"]'
    );

    expect(
      document.querySelector('[data-slot="common-dropdown-scroll-body"]')
    ).toBeNull();
    expect(content?.style.overflowY).toBe('auto');
    expect(content).toHaveAttribute('data-motion', 'fade');
    expect(content?.className).not.toContain('zoom-in');
  });

  it('fades the bottom while rows are below and clears it at the end', () => {
    render(
      <CommonDropdown
        items={historyItems(30)}
        open
        searchable
        scrollBody={MENU_SCROLL_BODY}
      />
    );
    const body = document.querySelector<HTMLElement>(
      '[data-slot="common-dropdown-scroll-body"]'
    ) as HTMLElement;

    setScrollMetrics(body, {
      scrollTop: 0,
      scrollHeight: 960,
      clientHeight: 320,
    });
    fireEvent.scroll(body);
    expect(body).toHaveAttribute('data-fade-bottom', 'true');
    expect(body).not.toHaveAttribute('data-fade-top');
    expect(body.style.maskImage).toContain('linear-gradient');

    setScrollMetrics(body, {
      scrollTop: 640,
      scrollHeight: 960,
      clientHeight: 320,
    });
    fireEvent.scroll(body);
    expect(body).not.toHaveAttribute('data-fade-bottom');
    expect(body).toHaveAttribute('data-fade-top', 'true');
  });

  it('shows the empty state inside the list when a search matches nothing', async () => {
    const user = userEvent.setup({ delay: null });
    render(
      <CommonDropdown
        items={historyItems(4)}
        open
        searchable
        scrollBody={MENU_SCROLL_BODY}
        emptyMessage='No Matching Chats'
      />
    );

    await user.type(screen.getByPlaceholderText('Search...'), 'zzz');

    const body = document.querySelector(
      '[data-slot="common-dropdown-scroll-body"]'
    );
    expect(body).toHaveTextContent('No Matching Chats');
  });

  // The menu portals outside any landmark, so axe runs on the menu itself.
  it('has no axe violations when open with search and rows', async () => {
    render(
      <CommonDropdown
        items={historyItems(8)}
        open
        modal={false}
        searchable
        scrollBody={MENU_SCROLL_BODY}
      />
    );
    await expectNoNewA11yViolations(await screen.findByRole('menu'));
  });

  it('has no axe violations when a search leaves the list empty', async () => {
    const user = userEvent.setup({ delay: null });
    render(
      <CommonDropdown
        items={historyItems(3)}
        open
        modal={false}
        searchable
        scrollBody={MENU_SCROLL_BODY}
      />
    );
    await user.type(screen.getByPlaceholderText('Search...'), 'zzz');
    await expectNoNewA11yViolations(await screen.findByRole('menu'));
  });

  it('has no axe violations while loading', async () => {
    render(
      <CommonDropdown
        items={[]}
        open
        modal={false}
        searchable
        scrollBody={MENU_SCROLL_BODY}
        isLoading
      />
    );
    await expectNoNewA11yViolations(await screen.findByRole('menu'));
  });
});

describe('CommonDropdown type to filter', () => {
  it('sends a printable key pressed on a row to the search field', async () => {
    const user = userEvent.setup({ delay: null });
    render(
      <CommonDropdown
        items={historyItems(6)}
        open
        searchable
        scrollBody={MENU_SCROLL_BODY}
      />
    );
    const input = screen.getByPlaceholderText('Search...');

    await user.click(input);
    await user.keyboard('{ArrowDown}');
    const firstRow = screen.getByRole('menuitem', { name: 'Chat 0' });
    await waitFor(() => expect(firstRow).toHaveFocus());

    await user.keyboard('rel');

    expect(input).toHaveFocus();
    expect(input).toHaveValue('rel');
    expect(
      screen.getByRole('menuitem', { name: 'Release Plan' })
    ).toBeVisible();
    expect(screen.queryByRole('menuitem', { name: 'Chat 0' })).toBeNull();
  });

  it('sends Backspace on a row to the search field', async () => {
    const user = userEvent.setup({ delay: null });
    render(
      <CommonDropdown
        scrollBody={MENU_SCROLL_BODY}
        items={historyItems(6)}
        open
        searchable
      />
    );
    const input = screen.getByPlaceholderText('Search...');

    await user.type(input, 'chat');
    await user.keyboard('{ArrowDown}');
    await waitFor(() =>
      expect(screen.getByRole('menuitem', { name: 'Chat 0' })).toHaveFocus()
    );

    await user.keyboard('{Backspace}');

    expect(input).toHaveFocus();
    expect(input).toHaveValue('cha');
  });

  it('leaves keys from a nested menu or a field inside a row alone', () => {
    render(
      <CommonDropdown
        scrollBody={MENU_SCROLL_BODY}
        items={[
          {
            type: 'custom',
            id: 'fields',
            render: () => (
              <div>
                <input aria-label='Rename' />
                <div role='menu' aria-label='Nested' data-radix-menu-content=''>
                  <div role='menuitem' tabIndex={-1}>
                    Nested Row
                  </div>
                </div>
              </div>
            ),
          },
        ]}
        open
        searchable
      />
    );
    const search = screen.getByPlaceholderText('Search...');

    fireEvent.keyDown(screen.getByLabelText('Rename'), { key: 'a' });
    fireEvent.keyDown(screen.getByText('Nested Row'), { key: 'b' });

    expect(search).toHaveValue('');
    expect(search).not.toHaveFocus();
  });

  it('leaves modified shortcuts and Space alone', async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup({ delay: null });
    render(
      <CommonDropdown
        scrollBody={MENU_SCROLL_BODY}
        items={[{ type: 'action', id: 'one', label: 'One', onClick: onSelect }]}
        open
        searchable
      />
    );
    const input = screen.getByPlaceholderText('Search...');
    await user.click(input);
    await user.keyboard('{ArrowDown}');
    const row = screen.getByRole('menuitem', { name: 'One' });
    await waitFor(() => expect(row).toHaveFocus());

    await user.keyboard('{Control>}a{/Control}');
    expect(input).toHaveValue('');
    expect(row).toHaveFocus();

    await user.keyboard(' ');
    expect(input).toHaveValue('');
    expect(onSelect).toHaveBeenCalledTimes(1);
  });
  it('leaves typing to the menu itself without a scroll body', async () => {
    const user = userEvent.setup({ delay: null });
    render(<CommonDropdown items={historyItems(6)} open searchable />);
    const input = screen.getByPlaceholderText('Search...');

    await user.click(input);
    await user.keyboard('{ArrowDown}');
    await waitFor(() =>
      expect(screen.getByRole('menuitem', { name: 'Chat 0' })).toHaveFocus()
    );
    await user.keyboard('r');

    expect(input).toHaveValue('');
  });
});

describe('CommonDropdown motion', () => {
  it('scales from the trigger with motion="anchored"', () => {
    render(
      <CommonDropdown
        items={historyItems(2)}
        open
        motion={MENU_MOTION_ANCHORED}
      />
    );
    const content = document.querySelector(
      '[data-slot="common-dropdown-content"]'
    );
    expect(content).toHaveAttribute('data-motion', 'anchored');
    expect(content?.className).toContain('data-[state=open]:zoom-in-97');
    expect(content?.className).toContain('data-[state=closed]:zoom-out-97');
    expect(content?.className).toContain(
      'motion-reduce:data-[state=open]:animate-none'
    );
    expect(content?.className).toContain(
      'origin-[--radix-dropdown-menu-content-transform-origin]'
    );
  });
});
