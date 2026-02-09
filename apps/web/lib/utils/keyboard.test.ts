import type React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { handleActivationKeyDown, isFormElement } from './keyboard';

describe('handleActivationKeyDown', () => {
  const createEvent = (
    key: string,
    modifiers: {
      ctrlKey?: boolean;
      shiftKey?: boolean;
      altKey?: boolean;
      metaKey?: boolean;
    } = {}
  ) =>
    ({
      key,
      ctrlKey: modifiers.ctrlKey ?? false,
      shiftKey: modifiers.shiftKey ?? false,
      altKey: modifiers.altKey ?? false,
      metaKey: modifiers.metaKey ?? false,
      preventDefault: vi.fn(),
    }) as unknown as React.KeyboardEvent;

  it('invokes handler for Enter', () => {
    const handler = vi.fn();
    const event = createEvent('Enter');

    handleActivationKeyDown(event, handler);

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith(event);
  });

  it('invokes handler for Space', () => {
    const handler = vi.fn();
    const event = createEvent(' ');

    handleActivationKeyDown(event, handler);

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith(event);
  });

  it('ignores other keys', () => {
    const handler = vi.fn();
    const event = createEvent('Escape');

    handleActivationKeyDown(event, handler);

    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(handler).not.toHaveBeenCalled();
  });

  it('ignores Enter with Ctrl modifier', () => {
    const handler = vi.fn();
    const event = createEvent('Enter', { ctrlKey: true });

    handleActivationKeyDown(event, handler);

    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(handler).not.toHaveBeenCalled();
  });

  it('ignores Space with Shift modifier', () => {
    const handler = vi.fn();
    const event = createEvent(' ', { shiftKey: true });

    handleActivationKeyDown(event, handler);

    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(handler).not.toHaveBeenCalled();
  });

  it('ignores Enter with Alt modifier', () => {
    const handler = vi.fn();
    const event = createEvent('Enter', { altKey: true });

    handleActivationKeyDown(event, handler);

    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(handler).not.toHaveBeenCalled();
  });

  it('ignores Space with Meta modifier', () => {
    const handler = vi.fn();
    const event = createEvent(' ', { metaKey: true });

    handleActivationKeyDown(event, handler);

    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(handler).not.toHaveBeenCalled();
  });

  it('ignores Enter with multiple modifiers', () => {
    const handler = vi.fn();
    const event = createEvent('Enter', { ctrlKey: true, shiftKey: true });

    handleActivationKeyDown(event, handler);

    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(handler).not.toHaveBeenCalled();
  });
});

describe('isFormElement', () => {
  it('returns true for INPUT elements', () => {
    const input = document.createElement('input');
    expect(isFormElement(input)).toBe(true);
  });

  it('returns true for TEXTAREA elements', () => {
    const textarea = document.createElement('textarea');
    expect(isFormElement(textarea)).toBe(true);
  });

  it('returns true for SELECT elements', () => {
    const select = document.createElement('select');
    expect(isFormElement(select)).toBe(true);
  });

  it('returns true for contentEditable elements', () => {
    const div = document.createElement('div');
    div.contentEditable = 'true';
    expect(isFormElement(div)).toBe(true);
  });

  it('returns true for descendants of contentEditable containers', () => {
    const container = document.createElement('div');
    container.contentEditable = 'true';
    const child = document.createElement('span');
    container.appendChild(child);
    document.body.appendChild(container);
    expect(isFormElement(child)).toBe(true);
    document.body.removeChild(container);
  });

  it('returns true for contentEditable="plaintext-only"', () => {
    const div = document.createElement('div');
    div.contentEditable = 'plaintext-only';
    expect(isFormElement(div)).toBe(true);
  });

  it('returns false for regular div', () => {
    const div = document.createElement('div');
    expect(isFormElement(div)).toBe(false);
  });

  it('returns false for button elements', () => {
    const button = document.createElement('button');
    expect(isFormElement(button)).toBe(false);
  });

  it('returns false for null', () => {
    expect(isFormElement(null)).toBe(false);
  });

  it('returns false for non-HTMLElement EventTarget', () => {
    const target = new EventTarget();
    expect(isFormElement(target)).toBe(false);
  });
});
