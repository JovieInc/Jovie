import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { getSeamSideOffset, SEAM_GAP, Tooltip } from './Tooltip';

function mockRect(el: HTMLElement, rect: Partial<DOMRect>) {
  el.getBoundingClientRect = () =>
    ({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      bottom: 0,
      right: 0,
      width: 0,
      height: 0,
      toJSON: () => ({}),
      ...rect,
    }) as DOMRect;
}

describe('getSeamSideOffset', () => {
  it('returns null when the trigger has no seam ancestor', () => {
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    expect(getSeamSideOffset(trigger)).toBeNull();
    trigger.remove();
  });

  it('aligns the tooltip left edge to the sidebar boundary + gap', () => {
    const sidebar = document.createElement('div');
    sidebar.dataset.sidebar = 'sidebar';
    const row = document.createElement('button');
    sidebar.appendChild(row);
    document.body.appendChild(sidebar);

    // Sidebar right edge (the vertical divider) at x=240; the row ends at
    // x=230 (inset by 10px of sidebar padding). Every row must share the
    // same tooltip x: divider + SEAM_GAP.
    mockRect(sidebar, { right: 240 });
    mockRect(row, { right: 230 });

    expect(getSeamSideOffset(row)).toBe(10 + SEAM_GAP);
    sidebar.remove();
  });

  it('produces the same offset target for rows with different right edges', () => {
    const sidebar = document.createElement('div');
    sidebar.dataset.sidebar = 'sidebar';
    const rowA = document.createElement('button');
    const rowB = document.createElement('button');
    sidebar.append(rowA, rowB);
    document.body.appendChild(sidebar);

    mockRect(sidebar, { right: 240 });
    mockRect(rowA, { right: 230 });
    mockRect(rowB, { right: 218 });

    // offset + rowRight must land on one shared x (divider + gap) for both.
    const offsetA = getSeamSideOffset(rowA);
    const offsetB = getSeamSideOffset(rowB);
    expect((offsetA ?? 0) + 230).toBe(240 + SEAM_GAP);
    expect((offsetB ?? 0) + 218).toBe(240 + SEAM_GAP);
    sidebar.remove();
  });

  it('supports the generic data-tooltip-boundary opt-in', () => {
    const boundary = document.createElement('nav');
    boundary.setAttribute('data-tooltip-boundary', '');
    const row = document.createElement('a');
    boundary.appendChild(row);
    document.body.appendChild(boundary);

    mockRect(boundary, { right: 300 });
    mockRect(row, { right: 288 });

    expect(getSeamSideOffset(row)).toBe(12 + SEAM_GAP);
    boundary.remove();
  });

  it('never returns an offset that overlaps back into the container', () => {
    const sidebar = document.createElement('div');
    sidebar.dataset.sidebar = 'sidebar';
    const row = document.createElement('button');
    sidebar.appendChild(row);
    document.body.appendChild(sidebar);

    // Row extends past the boundary (negative delta) — clamp to the gap.
    mockRect(sidebar, { right: 240 });
    mockRect(row, { right: 260 });

    expect(getSeamSideOffset(row)).toBe(SEAM_GAP);
    sidebar.remove();
  });
});

describe('Tooltip (shell)', () => {
  it('reads no layout when right-side tooltips mount in a seam container', () => {
    const spy = vi.spyOn(Element.prototype, 'getBoundingClientRect');
    render(
      <nav data-sidebar='sidebar'>
        <Tooltip label='Single child' side='right'>
          <button type='button'>Row</button>
        </Tooltip>
        <Tooltip label='Wrapped children' side='right'>
          <span>Icon</span>
          <span>Text</span>
        </Tooltip>
      </nav>
    );
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('preserves the full label without a line clamp', () => {
    render(
      <Tooltip
        label='Ask Jovie about my audience trends and engagement over the last quarter'
        side='right'
        defaultOpen
      >
        <button type='button'>Thread row</button>
      </Tooltip>
    );

    const content = screen.getByTestId('tooltip-content');
    expect(content).toHaveAttribute('data-slot', 'shell-tooltip-content');
    expect(content.className).not.toContain('whitespace-nowrap');

    // Radix may duplicate content for accessibility — assert on the visible
    // label span inside the tooltip content.
    const label = content.querySelector('span.min-w-0');
    expect(label).not.toBeNull();
    expect(label?.textContent).toContain('Ask Jovie about my audience trends');
    expect(label?.className).toContain('break-words');
    expect(label?.className).not.toContain('line-clamp');
    expect(label?.textContent).toBe(
      'Ask Jovie about my audience trends and engagement over the last quarter'
    );
  });
});

it('touch activates once without a stuck hint, then restores mouse and keyboard hints', async () => {
  const activate = vi.fn();
  render(
    <Tooltip label='Action hint'>
      <button type='button' onClick={activate}>
        Action
      </button>
    </Tooltip>
  );
  const trigger = screen.getByRole('button', { name: 'Action' });
  fireEvent.focus(trigger);
  expect(screen.getByTestId('tooltip-content')).toBeInTheDocument();
  const touch = new Event('pointerdown', { bubbles: true });
  Object.defineProperty(touch, 'pointerType', { value: 'touch' });
  fireEvent(trigger, touch);
  fireEvent.pointerUp(trigger);
  fireEvent.click(trigger);
  expect(activate).toHaveBeenCalledTimes(1);
  expect(screen.queryByTestId('tooltip-content')).not.toBeInTheDocument();
  fireEvent.blur(trigger);
  fireEvent.focus(trigger);
  expect(screen.queryByTestId('tooltip-content')).not.toBeInTheDocument();
  fireEvent.keyDown(document.body, { key: 'Tab' });
  fireEvent.blur(trigger);
  fireEvent.focus(trigger);
  expect(screen.getByTestId('tooltip-content')).toBeInTheDocument();
  fireEvent(trigger, touch);
  fireEvent.pointerUp(trigger);
  fireEvent.blur(trigger);
  const mouse = new Event('pointerover', { bubbles: true });
  Object.defineProperty(mouse, 'pointerType', { value: 'mouse' });
  fireEvent(trigger, mouse);
  fireEvent.focus(trigger);
  expect(screen.getByTestId('tooltip-content')).toBeInTheDocument();
});

describe('Tooltip (shell) accessibility', () => {
  async function expectOpenLayersClean(container: HTMLElement) {
    // Audit the trigger subtree and every portalled tooltip layer on its own;
    // the bare test page has no landmarks.
    const layers = document.body.querySelectorAll(
      '[data-radix-popper-content-wrapper]'
    );
    expect(layers.length).toBeGreaterThan(0);
    for (const node of [container, ...layers]) {
      await expectNoA11yViolations(node);
    }
  }

  it('opens on keyboard focus with a label and shortcut, without axe violations', async () => {
    const { container } = render(
      <Tooltip
        label='Open audience'
        shortcut={{ keys: 'G A', description: 'Open audience' }}
      >
        <button type='button'>Audience</button>
      </Tooltip>
    );
    expect(screen.queryByTestId('tooltip-content')).not.toBeInTheDocument();

    fireEvent.focus(screen.getByRole('button', { name: 'Audience' }));

    const content = screen.getByTestId('tooltip-content');
    expect(content).toHaveTextContent('Open audience');
    expect(content).toHaveTextContent('G A');
    await expectOpenLayersClean(container);
  });

  it('renders a label-only hint for an icon trigger without a keycap', async () => {
    const { container } = render(
      <Tooltip label='Inbox' side='right' defaultOpen>
        <button type='button' aria-label='Inbox'>
          <svg aria-hidden='true' />
        </button>
      </Tooltip>
    );

    const content = screen.getByTestId('tooltip-content');
    expect(content).toHaveTextContent('Inbox');
    expect(content.querySelector('kbd')).toBeNull();
    await expectOpenLayersClean(container);
  });

  it('keeps an RTL label and shortcut intact', async () => {
    const { container } = render(
      <div dir='rtl'>
        <Tooltip
          label='افتح صفحة الجمهور لمراجعة التفاعل خلال الربع الأخير'
          shortcut={{ keys: 'G A', description: 'افتح الجمهور' }}
          defaultOpen
        >
          <button type='button'>الجمهور</button>
        </Tooltip>
      </div>
    );

    const label = screen
      .getByTestId('tooltip-content')
      .querySelector('span.min-w-0');
    expect(label?.textContent).toBe(
      'افتح صفحة الجمهور لمراجعة التفاعل خلال الربع الأخير'
    );
    await expectOpenLayersClean(container);
  });

  it('stays closed while disabled', async () => {
    const { container } = render(
      <Tooltip label='Open audience' disabled>
        <button type='button'>Audience</button>
      </Tooltip>
    );

    fireEvent.focus(screen.getByRole('button', { name: 'Audience' }));
    expect(screen.queryByTestId('tooltip-content')).not.toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});

describe('Tooltip forced closed', () => {
  // The collapsing-sidebar orphan: intent gathered while `open={false}` must
  // not survive to the moment the owner releases the tooltip.
  it('needs fresh intent after the owner stops forcing it closed', async () => {
    const view = (open: false | undefined) => (
      <Tooltip label='Status' open={open}>
        <button type='button'>Account</button>
      </Tooltip>
    );
    const { rerender } = render(view(false));
    const trigger = screen.getByRole('button', { name: 'Account' });
    fireEvent.focus(trigger);
    await act(async () => {});
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();

    rerender(view(undefined));
    await act(async () => {});
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();

    fireEvent.blur(trigger);
    fireEvent.focus(trigger);
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Status');
  });
});
