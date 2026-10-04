import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import {
  observeWindowVisualActivity,
  trustedVisualActivityRequest,
} from '../src/visual-activity';

function fixture() {
  const window = Object.assign(new EventEmitter(), {
    visible: true,
    minimized: false,
    destroyed: false,
    isVisible() {
      return this.visible;
    },
    isMinimized() {
      return this.minimized;
    },
    isDestroyed() {
      return this.destroyed;
    },
  });
  const power = new EventEmitter();
  const publish = vi.fn();
  const observer = observeWindowVisualActivity(window, power, publish);
  return { window, power, publish, ...observer };
}

describe('native visual activity', () => {
  it('tracks hide and minimize separately, while blur leaves a visible window active', () => {
    const f = fixture();
    expect(f.read()).toBe(true);
    f.window.emit('blur');
    expect(f.read()).toBe(true);
    expect(f.publish).not.toHaveBeenCalled();
    f.window.visible = false;
    f.window.emit('hide');
    f.window.emit('hide');
    expect(f.read()).toBe(false);
    f.window.minimized = true;
    f.window.visible = true;
    f.window.emit('show');
    expect(f.read()).toBe(false);
    f.window.minimized = false;
    f.window.emit('restore');
    f.window.emit('show');
    expect(f.publish.mock.calls).toEqual([[false], [true]]);
  });

  it('stays inactive through sleep until awake and visible, then reconciles once', () => {
    const f = fixture();
    f.power.emit('suspend');
    f.window.emit('show');
    expect(f.read()).toBe(false);
    f.window.visible = false;
    f.power.emit('resume');
    expect(f.read()).toBe(false);
    f.window.visible = true;
    f.window.emit('show');
    f.power.emit('resume');
    expect(f.publish.mock.calls).toEqual([[false], [true]]);
  });

  it('removes window and power listeners on close without changing other owners', () => {
    const f = fixture();
    const other = vi.fn();
    f.power.on('resume', other);
    f.window.destroyed = true;
    f.window.emit('closed');
    f.power.emit('resume');
    expect(f.read()).toBe(false);
    expect(f.publish).not.toHaveBeenCalled();
    expect(f.window.eventNames()).toEqual([]);
    expect(f.power.listenerCount('suspend')).toBe(0);
    expect(other).toHaveBeenCalledOnce();
    f.dispose();
  });

  it('accepts only payload-free current main-window frame reads at the app origin', () => {
    const request = {
      args: [],
      isMainWindow: true,
      isCurrentMainFrame: true,
      senderUrl: 'https://jov.ie/app/chat',
      appOrigin: 'https://jov.ie',
    };
    expect(trustedVisualActivityRequest(request)).toBe(true);
    for (const patch of [
      { args: [false] },
      { isMainWindow: false },
      { isCurrentMainFrame: false },
      { senderUrl: 'https://other.test/app/chat' },
      { senderUrl: 'not a url' },
    ])
      expect(trustedVisualActivityRequest({ ...request, ...patch })).toBe(
        false
      );
  });
});
