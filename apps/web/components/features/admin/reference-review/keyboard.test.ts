import { describe, expect, it } from 'vitest';
import { referenceKeyAction } from './keyboard';

function key(
  value: string,
  target: HTMLElement = document.createElement('section'),
  options: KeyboardEventInit = {}
) {
  const event = new KeyboardEvent('keydown', { key: value, ...options });
  Object.defineProperty(event, 'target', { value: target });
  return event;
}
describe('reference keyboard ratings', () => {
  it('maps each 1–5 key, undo and skip only in the focused review area', () => {
    for (const rating of [1, 2, 3, 4, 5])
      expect(referenceKeyAction(key(String(rating)), 'ref')).toEqual({
        type: 'rate',
        referenceId: 'ref',
        rating,
      });
    expect(referenceKeyAction(key('s'), 'ref')).toEqual({
      type: 'skip',
      referenceId: 'ref',
    });
    expect(referenceKeyAction(key('z'), null)).toEqual({ type: 'undo' });
    expect(referenceKeyAction(key('5'), null)).toBeNull();
  });
  it('preserves editing, focused controls, menus, IME, repeat and browser shortcuts', () => {
    for (const tag of ['input', 'textarea', 'select', 'button', 'a'])
      expect(
        referenceKeyAction(key('5', document.createElement(tag)), 'ref')
      ).toBeNull();
    const edit = document.createElement('div');
    edit.setAttribute('contenteditable', 'true');
    const child = document.createElement('span');
    edit.append(child);
    expect(referenceKeyAction(key('5', child), 'ref')).toBeNull();
    for (const options of [
      { ctrlKey: true },
      { metaKey: true },
      { altKey: true },
      { shiftKey: true },
      { repeat: true },
      { isComposing: true },
    ])
      expect(
        referenceKeyAction(key('5', undefined, options), 'ref')
      ).toBeNull();
    const consumed = key('5', undefined, { cancelable: true });
    consumed.preventDefault();
    expect(referenceKeyAction(consumed, 'ref')).toBeNull();
  });
});
