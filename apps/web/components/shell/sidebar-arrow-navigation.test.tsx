import { describe, expect, it } from 'vitest';
import {
  moveSidebarNavFocus,
  nextSidebarNavIndex,
} from './sidebar-arrow-navigation';

describe('nextSidebarNavIndex', () => {
  it('clamps at the ends instead of wrapping', () => {
    expect(nextSidebarNavIndex(4, 0, 'ArrowUp')).toBe(0);
    expect(nextSidebarNavIndex(4, 3, 'ArrowDown')).toBe(3);
    expect(nextSidebarNavIndex(4, 1, 'ArrowDown')).toBe(2);
    expect(nextSidebarNavIndex(4, 2, 'ArrowUp')).toBe(1);
  });
  it('supports Home and End and ignores other keys', () => {
    expect(nextSidebarNavIndex(4, 2, 'Home')).toBe(0);
    expect(nextSidebarNavIndex(4, 1, 'End')).toBe(3);
    expect(nextSidebarNavIndex(4, 1, 'a')).toBeNull();
    expect(nextSidebarNavIndex(0, -1, 'ArrowDown')).toBeNull();
  });
});

describe('moveSidebarNavFocus', () => {
  function setup() {
    document.body.innerHTML = `<div id="root"><nav>
      <a href="/a">A</a><a href="/b">B</a><button type="button">C</button>
      <input aria-label="field" /></nav></div>`;
    const root = document.getElementById('root')!;
    const [a, b, c] = Array.from(
      root.querySelectorAll<HTMLElement>('a, button')
    );
    return { root, a, b, c, input: root.querySelector('input')! };
  }
  it('moves focus between rows and reports handled', () => {
    const { root, a, b, c } = setup();
    a.focus();
    expect(
      moveSidebarNavFocus(root, {
        key: 'ArrowDown',
        target: a,
      } as KeyboardEvent)
    ).toBe(true);
    expect(document.activeElement).toBe(b);
    moveSidebarNavFocus(root, { key: 'End', target: b } as KeyboardEvent);
    expect(document.activeElement).toBe(c);
  });
  it('leaves text fields and modified keys alone', () => {
    const { root, a, input } = setup();
    expect(
      moveSidebarNavFocus(root, {
        key: 'ArrowDown',
        target: input,
      } as KeyboardEvent)
    ).toBe(false);
    expect(
      moveSidebarNavFocus(root, {
        key: 'ArrowDown',
        target: a,
        metaKey: true,
      } as KeyboardEvent)
    ).toBe(false);
  });
  it('skips rows hidden from assistive tech', () => {
    const { root, a, b } = setup();
    b.setAttribute('aria-hidden', 'true');
    moveSidebarNavFocus(root, { key: 'ArrowDown', target: a } as KeyboardEvent);
    expect(document.activeElement?.textContent).toBe('C');
  });
});
