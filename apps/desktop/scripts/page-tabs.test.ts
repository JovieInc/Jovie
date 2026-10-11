import { describe, expect, it, vi } from 'vitest';
import {
  parsePageTabsBounds,
  parsePageTabsCommand,
  WindowPageTabs,
} from '../src/page-tabs';

describe('native page strip bounds', () => {
  const rect = { x: 252, y: 8, width: 940, height: 32, dark: true, ov: false };
  it('scales CSS pixels with page zoom and preserves theme', () => {
    expect(parsePageTabsBounds(rect, 1, [1200, 800])).toEqual({
      bounds: { x: 252, y: 8, width: 940, height: 32 },
      appearance: { dark: true, ov: false },
    });
    expect(
      parsePageTabsBounds({ ...rect, width: 700 }, 1.25, [1200, 800])?.bounds
    ).toEqual({ x: 315, y: 10, width: 875, height: 40 });
    expect(
      parsePageTabsBounds({ ...rect, x: 60, width: 1132 }, 1, [1200, 800])
        ?.bounds
    ).toEqual({ x: 80, y: 8, width: 1112, height: 32 });
  });
  it('rejects malformed, empty, off-window and oversized requests', () => {
    for (const value of [
      null,
      false,
      {},
      { ...rect, x: NaN },
      { ...rect, y: -1 },
      { ...rect, x: -1 },
      { ...rect, width: 0 },
      { ...rect, height: 0 },
      { ...rect, height: 65 },
      { ...rect, width: Infinity },
      { ...rect, dark: 'true' },
      { ...rect, width: 2000 },
      { ...rect, y: 799 },
      { ...rect, x: 0, width: 50 },
    ])
      expect(parsePageTabsBounds(value, 1, [1200, 800])).toBeNull();
    for (const zoom of [0, -1, NaN, Infinity])
      expect(parsePageTabsBounds(rect, zoom, [1200, 800])).toBeNull();
    expect(
      parsePageTabsBounds({ ...rect, height: 0.01 }, 1, [1200, 800])
    ).toBeNull();
  });
});

function fixture() {
  const host = {
    create: vi.fn(() => ({ history: ['/app/chat'], draft: '', scroll: 0 })),
    show: vi.fn(),
    close: vi.fn(),
    canClose: vi.fn(async () => true),
    publish: vi.fn(),
  };
  return { host, tabs: new WindowPageTabs(host) };
}

describe('independent window pages', () => {
  it('keeps each live page, draft, history and scroll while switching', async () => {
    const { tabs, host } = fixture();
    expect(tabs.active).toBeUndefined();
    tabs.create();
    const first = tabs.active!;
    first.draft = 'unsent song';
    first.scroll = 414;
    first.history.push('/app/library');
    await tabs.command({ type: 'create' });
    const second = tabs.active!;
    second.draft = 'another draft';
    await tabs.command({ type: 'select', id: 1 });
    expect(tabs.active).toBe(first);
    expect(first).toEqual({
      draft: 'unsent song',
      scroll: 414,
      history: ['/app/chat', '/app/library'],
    });
    expect(second.draft).toBe('another draft');
    expect(host.close).not.toHaveBeenCalled();
    expect(tabs.state().tabs.map(tab => tab.id)).toEqual([1, 2]);
    expect(tabs.select(999)).toBe(false);
  });

  it('retains the original page when closing is cancelled or unknown', async () => {
    const { tabs, host } = fixture();
    tabs.create();
    host.canClose.mockResolvedValue(false);
    const original = tabs.active;
    expect(await tabs.command({ type: 'close', id: 1 })).toBe(false);
    expect(await tabs.command({ type: 'close', id: 50 })).toBe(false);
    expect(tabs.active).toBe(original);
    expect(host.close).not.toHaveBeenCalled();
  });

  it('selects the next neighbour, then previous neighbour without remounting', async () => {
    const { tabs, host } = fixture();
    tabs.create();
    tabs.create();
    tabs.create();
    tabs.select(2);
    await tabs.command({ type: 'close', id: 2 });
    expect(tabs.state().activeId).toBe(3);
    await tabs.command({ type: 'close', id: 3 });
    expect(tabs.state().activeId).toBe(1);
    expect(host.create).toHaveBeenCalledTimes(3);
    expect(host.close).toHaveBeenCalledTimes(2);
  });

  it('does not change active focus when a background tab closes', async () => {
    const { tabs, host } = fixture();
    tabs.create();
    tabs.create();
    host.show.mockClear();
    await tabs.command({ type: 'close', id: 1 });
    expect(tabs.state().activeId).toBe(2);
    expect(host.show).not.toHaveBeenCalled();
  });

  it('creates a fresh page before releasing the last page', async () => {
    const { tabs, host } = fixture();
    tabs.create();
    const previous = tabs.active;
    await tabs.command({ type: 'close', id: 1 });
    expect(tabs.all).toHaveLength(1);
    expect(tabs.active).not.toBe(previous);
    expect(tabs.state().activeId).toBe(2);
    expect(host.close).toHaveBeenCalledWith(previous);
  });

  it('serializes commands across a pending close confirmation', async () => {
    const { tabs, host } = fixture();
    tabs.create();
    tabs.create();
    let confirm: (value: boolean) => void = () => undefined;
    host.canClose.mockImplementation(
      () =>
        new Promise(resolve => {
          confirm = resolve;
        })
    );
    const close = tabs.command({ type: 'close', id: 2 });
    const create = tabs.command({ type: 'create' });
    await Promise.resolve();
    expect(host.create).toHaveBeenCalledTimes(2);
    confirm(true);
    await close;
    await create;
    expect(tabs.state().tabs.map(tab => tab.id)).toEqual([1, 3]);
  });

  it('recovers its command queue after a failed host operation', async () => {
    const { tabs, host } = fixture();
    tabs.create();
    host.canClose.mockRejectedValueOnce(new Error('dialog unavailable'));
    await expect(tabs.command({ type: 'close', id: 1 })).rejects.toThrow(
      'dialog unavailable'
    );
    expect(await tabs.command({ type: 'create' })).toBe(true);
  });

  it('updates live page metadata and ignores removed or unknown pages', async () => {
    const { tabs, host } = fixture();
    tabs.create();
    const page = tabs.active!;
    tabs.update(page, { title: 'Library', loading: false });
    expect(tabs.state().tabs[0]).toEqual({
      id: 1,
      title: 'Library',
      loading: false,
    });
    const count = host.publish.mock.calls.length;
    tabs.update({ draft: '', history: [], scroll: 0 }, { title: 'unknown' });
    expect(host.publish).toHaveBeenCalledTimes(count);
    tabs.dispose();
    tabs.dispose();
    tabs.update(page, { title: 'late event' });
    expect(tabs.all).toHaveLength(0);
    expect(tabs.create()).toBe(false);
    expect(tabs.select(1)).toBe(false);
    expect(await tabs.command({ type: 'create' })).toBe(false);
    expect(host.close).toHaveBeenCalledTimes(1);
  });

  it('does not resurrect a window destroyed during confirmation', async () => {
    const { tabs, host } = fixture();
    tabs.create();
    let confirm: (value: boolean) => void = () => undefined;
    host.canClose.mockImplementation(
      () =>
        new Promise(resolve => {
          confirm = resolve;
        })
    );
    const close = tabs.command({ type: 'close', id: 1 });
    await Promise.resolve();
    tabs.dispose();
    confirm(true);
    expect(await close).toBe(false);
    expect(host.create).toHaveBeenCalledTimes(1);
  });
});

describe('page command boundary', () => {
  it('accepts only typed commands with positive safe identifiers and exact keys', () => {
    expect(parsePageTabsCommand({ type: 'create' })).toEqual({
      type: 'create',
    });
    expect(parsePageTabsCommand({ type: 'select', id: 1 })).toEqual({
      type: 'select',
      id: 1,
    });
    expect(parsePageTabsCommand({ type: 'close', id: 2 })).toEqual({
      type: 'close',
      id: 2,
    });
    for (const invalid of [
      null,
      false,
      '',
      [],
      {},
      { type: 'create', url: 'https://evil.example' },
      { type: 'select' },
      { type: 'close', id: '1' },
      { type: 'select', id: 0 },
      { type: 'close', id: 1.2 },
      { type: 'close', id: Number.MAX_SAFE_INTEGER + 1 },
      { type: 'navigate', id: 1 },
      { type: 'select', id: 1, url: '/app' },
    ]) {
      expect(parsePageTabsCommand(invalid)).toBeNull();
    }
  });
});
