import type React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { handleActivationKeyDown } from './keyboard';

describe('handleActivationKeyDown', () => {
  const createEvent = (key: string) =>
    ({
      key,
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
});
