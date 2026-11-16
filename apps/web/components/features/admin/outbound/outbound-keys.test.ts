import { afterEach, describe, expect, it } from 'vitest';
import { isTypingTarget } from './outbound-keys';

function mount(html: string): HTMLElement {
  document.body.innerHTML = html;
  const target = document.querySelector<HTMLElement>('[data-target]');
  if (!target) throw new Error('missing target');
  return target;
}

describe('isTypingTarget', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('keeps workspace hotkeys away from a focused confirm (alertdialog)', () => {
    const button = mount(
      '<div role="alertdialog" aria-modal="true"><button data-target>Confirm</button></div>'
    );
    expect(isTypingTarget(button)).toBe(true);
  });

  it('keeps workspace hotkeys away from a plain dialog', () => {
    const button = mount(
      '<div role="dialog"><button data-target>Close</button></div>'
    );
    expect(isTypingTarget(button)).toBe(true);
  });

  it('lets hotkeys through from the workspace itself', () => {
    const row = mount('<div><button data-target>Row</button></div>');
    expect(isTypingTarget(row)).toBe(false);
  });
});
