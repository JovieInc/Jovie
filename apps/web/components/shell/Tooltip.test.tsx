import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
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
  it('renders the label with a two-line clamp instead of nowrap clipping', () => {
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
    expect(content.className).not.toContain('whitespace-nowrap');

    // Radix may duplicate content for accessibility — assert on the visible
    // label span inside the tooltip content.
    const label = content.querySelector('span.line-clamp-2');
    expect(label).not.toBeNull();
    expect(label?.textContent).toContain('Ask Jovie about my audience trends');
    expect(label?.className).toContain('break-words');
  });
});
