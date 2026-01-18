import type React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { handleActivationKeyDown } from './keyboard';

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
