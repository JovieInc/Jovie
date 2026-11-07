import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { useState } from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ActionDial,
  type ActionDialOption,
  DIAL_HINT_SEEN_KEY,
} from './ActionDial';

const OPTIONS: ActionDialOption[] = [
  {
    id: 'spotify',
    label: 'Spotify',
    href: 'https://open.spotify.com/song',
    icon: <span>Spotify icon</span>,
  },
  {
    id: 'apple',
    label: 'Apple Music',
    href: 'https://music.apple.com/song',
    icon: <span>Apple icon</span>,
  },
  {
    id: 'deezer',
    label: 'Deezer',
    href: 'https://deezer.com/song',
    icon: <span>Deezer icon</span>,
  },
];

const MANY: ActionDialOption[] = Array.from({ length: 100 }, (_, i) => ({
  id: `d${i + 1}`,
  label: `Dest ${String(i + 1).padStart(3, '0')}`,
  href: `https://example.com/${i + 1}`,
  icon: <span>icon {i + 1}</span>,
}));

function touch(
  target: Element,
  type: string,
  clientY: number,
  timeStamp: number
) {
  const event = new MouseEvent(type, { bubbles: true, clientY });
  Object.defineProperties(event, {
    pointerId: { value: 1 },
    pointerType: { value: 'touch' },
    // React treats a 0 timeStamp as missing, so offset the fake clock.
    timeStamp: { value: timeStamp + 1000 },
  });
  fireEvent(target, event);
}

function Fixture({
  options = OPTIONS,
  onSelect = vi.fn(),
  onActivate,
}: {
  readonly options?: ActionDialOption[];
  readonly onSelect?: (id: string) => void;
  readonly onActivate?: (id: string) => void;
}) {
  const [selectedId, setSelectedId] = useState(options[0]!.id);
  return (
    <ActionDial
      options={options}
      selectedId={selectedId}
      onSelect={id => {
        setSelectedId(id);
        onSelect(id);
      }}
      onActivate={onActivate}
      actionLabel='Stream Now'
      groupLabel='Choose a streaming service'
    />
  );
}

function mockMotion(reduced: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: reduced && query.includes('reduce'),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))
  );
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const status = () => screen.getByRole('status').textContent;
const link = () => screen.getByRole('link', { name: /^Stream Now with/ });

describe('ActionDial semantics', () => {
  it('is a labelled listbox with positional options and an activedescendant', () => {
    render(<Fixture options={MANY} />);
    const listbox = screen.getByRole('listbox', {
      name: 'Choose a streaming service',
    });
    const selected = screen.getByRole('option', { selected: true });
    expect(selected).toHaveAttribute('aria-posinset', '1');
    expect(selected).toHaveAttribute('aria-setsize', '100');
    expect(listbox).toHaveAttribute('aria-activedescendant', selected.id);
    expect(listbox).toHaveAttribute('tabindex', '0');
    expect(
      screen.getByRole('group', { name: 'Choose a streaming service' })
    ).toBeInTheDocument();
  });
  it('windows 100 options to a handful of rows', () => {
    render(<Fixture options={MANY} />);
    const rows = screen.getAllByRole('option');
    expect(rows.length).toBeLessThanOrEqual(11);
    expect(rows.length).toBeGreaterThanOrEqual(6);
    expect(screen.getByTestId('action-dial-icon-d1')).toBeInTheDocument();
    expect(
      screen.queryByTestId('action-dial-icon-d50')
    ).not.toBeInTheDocument();
  });
  it('announces the settled selection politely', async () => {
    mockMotion(true);
    render(<Fixture />);
    expect(status()).toBe('Spotify selected');
    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'ArrowDown' });
    await waitFor(() => expect(status()).toBe('Apple Music selected'));
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
  });
  it('keeps the Stream Now link on the centered service', async () => {
    mockMotion(true);
    render(<Fixture />);
    expect(link()).toHaveAttribute('href', 'https://open.spotify.com/song');
    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'End' });
    await waitFor(() =>
      expect(link()).toHaveAttribute('href', 'https://deezer.com/song')
    );
    expect(link()).toHaveAttribute('aria-label', 'Stream Now with Deezer');
  });
});

describe('ActionDial keyboard', () => {
  it('moves with arrows, Home, End and paging, clamped at the ends', async () => {
    mockMotion(true);
    const onSelect = vi.fn();
    render(<Fixture options={MANY} onSelect={onSelect} />);
    const listbox = screen.getByRole('listbox');
    fireEvent.keyDown(listbox, { key: 'ArrowDown' });
    expect(onSelect).toHaveBeenLastCalledWith('d2');
    fireEvent.keyDown(listbox, { key: 'ArrowUp' });
    expect(onSelect).toHaveBeenLastCalledWith('d1');
    fireEvent.keyDown(listbox, { key: 'ArrowUp' });
    expect(link()).toHaveAttribute('href', 'https://example.com/1');
    fireEvent.keyDown(listbox, { key: 'PageDown' });
    expect(onSelect).toHaveBeenLastCalledWith('d6');
    fireEvent.keyDown(listbox, { key: 'PageUp' });
    expect(onSelect).toHaveBeenLastCalledWith('d1');
    fireEvent.keyDown(listbox, { key: 'End' });
    expect(onSelect).toHaveBeenLastCalledWith('d100');
    fireEvent.keyDown(listbox, { key: 'ArrowDown' });
    expect(onSelect).toHaveBeenLastCalledWith('d100');
    fireEvent.keyDown(listbox, { key: 'Home' });
    expect(onSelect).toHaveBeenLastCalledWith('d1');
  });
  it('prevents page scroll for handled keys and ignores modified ones', () => {
    mockMotion(true);
    render(<Fixture />);
    const listbox = screen.getByRole('listbox');
    expect(fireEvent.keyDown(listbox, { key: 'ArrowDown' })).toBe(false);
    expect(
      fireEvent.keyDown(listbox, { key: 'ArrowDown', metaKey: true })
    ).toBe(true);
    expect(fireEvent.keyDown(listbox, { key: 'Tab' })).toBe(true);
  });
  it('jumps by typeahead', () => {
    mockMotion(true);
    const onSelect = vi.fn();
    render(<Fixture onSelect={onSelect} />);
    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'd' });
    expect(onSelect).toHaveBeenLastCalledWith('deezer');
  });
  it('ticks the selection haptic for each item crossed', async () => {
    mockMotion(true);
    const vibrate = vi.fn();
    Object.defineProperty(navigator, 'vibrate', {
      configurable: true,
      value: vibrate,
    });
    render(<Fixture />);
    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'ArrowDown' });
    expect(vibrate).toHaveBeenCalledWith([5]);
  });
  it('does not throw where vibrate is unavailable', () => {
    mockMotion(true);
    Object.defineProperty(navigator, 'vibrate', {
      configurable: true,
      value: undefined,
    });
    render(<Fixture />);
    expect(() =>
      fireEvent.keyDown(screen.getByRole('listbox'), { key: 'ArrowDown' })
    ).not.toThrow();
  });
});

describe('ActionDial touch', () => {
  it('follows a slow drag and settles on the nearest item', async () => {
    mockMotion(true);
    const onSelect = vi.fn();
    render(<Fixture onSelect={onSelect} />);
    const dial = screen.getByTestId('action-dial');
    touch(dial, 'pointerdown', 200, 0);
    touch(dial, 'pointermove', 170, 100);
    touch(dial, 'pointermove', 140, 200);
    expect(Number(dial.getAttribute('data-position'))).toBeCloseTo(60 / 56, 2);
    touch(dial, 'pointermove', 138, 500);
    touch(dial, 'pointerup', 138, 600);
    expect(onSelect).toHaveBeenCalledWith('apple');
    expect(dial.getAttribute('data-position')).toBe('1');
  });
  it('flings far through a long list', () => {
    mockMotion(true);
    const onSelect = vi.fn();
    render(<Fixture options={MANY} onSelect={onSelect} />);
    const dial = screen.getByTestId('action-dial');
    touch(dial, 'pointerdown', 200, 0);
    for (let i = 1; i <= 8; i++)
      touch(dial, 'pointermove', 200 - i * 20, i * 10);
    touch(dial, 'pointerup', 40, 82);
    const id = onSelect.mock.calls.at(-1)?.[0] as string;
    expect(Number(id.slice(1))).toBeGreaterThan(10);
  });
  it('rubber-bands past the first item and returns', () => {
    mockMotion(true);
    const onSelect = vi.fn();
    render(<Fixture onSelect={onSelect} />);
    const dial = screen.getByTestId('action-dial');
    touch(dial, 'pointerdown', 100, 0);
    touch(dial, 'pointermove', 300, 100);
    const shown = Number(dial.getAttribute('data-position'));
    expect(shown).toBeLessThan(0);
    expect(shown).toBeGreaterThan(-2);
    touch(dial, 'pointermove', 300, 400);
    touch(dial, 'pointerup', 300, 500);
    expect(dial.getAttribute('data-position')).toBe('0');
    expect(onSelect).not.toHaveBeenCalled();
  });
  it('does not select on a pointer cancel', () => {
    mockMotion(true);
    const onSelect = vi.fn();
    render(<Fixture onSelect={onSelect} />);
    const dial = screen.getByTestId('action-dial');
    touch(dial, 'pointerdown', 200, 0);
    touch(dial, 'pointermove', 100, 50);
    touch(dial, 'pointercancel', 100, 60);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });
  it('stops momentum on touch and does not activate what it lands on', async () => {
    const onActivate = vi.fn();
    mockMotion(false);
    render(<Fixture options={MANY} onActivate={onActivate} />);
    const dial = screen.getByTestId('action-dial');
    touch(dial, 'pointerdown', 200, 0);
    for (let i = 1; i <= 8; i++)
      touch(dial, 'pointermove', 200 - i * 20, i * 10);
    touch(dial, 'pointerup', 40, 82);
    await waitFor(() =>
      expect(dial.getAttribute('data-state')).toBe('release')
    );
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 120));
    });
    touch(dial, 'pointerdown', 150, performance.now() - 1000);
    const frozen = dial.getAttribute('data-position');
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 150));
    });
    expect(dial.getAttribute('data-position')).toBe(frozen);
    expect(dial.getAttribute('data-state')).toBe('drag');
    touch(dial, 'pointerup', 150, performance.now() - 1000);
    fireEvent.click(link());
    expect(onActivate).not.toHaveBeenCalled();
  });
  it('selects an adjacent row on tap', async () => {
    mockMotion(true);
    const onSelect = vi.fn();
    render(<Fixture onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('option', { name: 'Apple Music' }));
    expect(onSelect).toHaveBeenCalledWith('apple');
  });
  it('activates the centered service from the Stream Now link', () => {
    mockMotion(true);
    const onActivate = vi.fn();
    render(<Fixture onActivate={onActivate} />);
    fireEvent.click(link());
    expect(onActivate).toHaveBeenCalledWith('spotify');
  });
  it('lets a drag begin on the Stream Now link without activating it', () => {
    mockMotion(true);
    const onActivate = vi.fn();
    render(<Fixture onActivate={onActivate} />);
    const dial = screen.getByTestId('action-dial');
    touch(link(), 'pointerdown', 110, 0);
    touch(link(), 'pointermove', 50, 100);
    touch(link(), 'pointerup', 50, 200);
    fireEvent.click(link());
    expect(onActivate).not.toHaveBeenCalled();
    expect(dial.getAttribute('data-position')).not.toBe('0');
  });
});

describe('ActionDial wheel', () => {
  it('registers a non-passive wheel listener and steps one item per notch', () => {
    mockMotion(true);
    const add = vi.spyOn(HTMLElement.prototype, 'addEventListener');
    const onSelect = vi.fn();
    render(<Fixture options={MANY} onSelect={onSelect} />);
    const calls = add.mock.calls.filter(([type]) => type === 'wheel');
    expect(
      calls.some(
        call =>
          (call[2] as AddEventListenerOptions | undefined)?.passive === false
      )
    ).toBe(true);
    const dial = screen.getByTestId('action-dial');
    const notch = new WheelEvent('wheel', {
      deltaY: 100,
      bubbles: true,
      cancelable: true,
    });
    dial.dispatchEvent(notch);
    expect(notch.defaultPrevented).toBe(true);
    expect(onSelect).toHaveBeenLastCalledWith('d2');
  });
  it('lets the page scroll once the dial is at its end', () => {
    mockMotion(true);
    render(<Fixture options={MANY} />);
    const dial = screen.getByTestId('action-dial');
    const up = new WheelEvent('wheel', {
      deltaY: -100,
      bubbles: true,
      cancelable: true,
    });
    dial.dispatchEvent(up);
    expect(up.defaultPrevented).toBe(false);
  });
  it('ignores horizontal and pinch wheels', () => {
    mockMotion(true);
    render(<Fixture options={MANY} />);
    const dial = screen.getByTestId('action-dial');
    const side = new WheelEvent('wheel', {
      deltaX: 80,
      deltaY: 5,
      bubbles: true,
      cancelable: true,
    });
    dial.dispatchEvent(side);
    const pinch = new WheelEvent('wheel', {
      deltaY: 100,
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    dial.dispatchEvent(pinch);
    expect(side.defaultPrevented).toBe(false);
    expect(pinch.defaultPrevented).toBe(false);
  });
});

describe('ActionDial first-use hint', () => {
  const hint = () => screen.getByTestId('action-dial-hint');

  it('shows on first visit with a screen-reader description', async () => {
    mockMotion(true);
    render(<Fixture />);
    await waitFor(() => expect(hint()).toHaveAttribute('data-visible', 'true'));
    expect(screen.getByRole('listbox')).toHaveAccessibleDescription(
      /Swipe to switch/
    );
    expect(hint()).toHaveAttribute('aria-hidden', 'true');
  });
  it('hides after keyboard use and stays hidden on a fresh mount', async () => {
    mockMotion(true);
    const first = render(<Fixture />);
    await waitFor(() => expect(hint()).toHaveAttribute('data-visible', 'true'));
    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'ArrowDown' });
    expect(hint()).toHaveAttribute('data-visible', 'false');
    expect(localStorage.getItem(DIAL_HINT_SEEN_KEY)).toBe('1');
    first.unmount();
    render(<Fixture />);
    await act(async () => {});
    expect(hint()).toHaveAttribute('data-visible', 'false');
    expect(screen.getByRole('listbox')).toHaveAccessibleDescription(
      /Swipe to switch/
    );
  });
  it('hides after a swipe', async () => {
    mockMotion(true);
    render(<Fixture />);
    await waitFor(() => expect(hint()).toHaveAttribute('data-visible', 'true'));
    const dial = screen.getByTestId('action-dial');
    touch(dial, 'pointerdown', 200, 0);
    touch(dial, 'pointermove', 190, 50);
    expect(hint()).toHaveAttribute('data-visible', 'false');
  });
  it('hides after a wheel step', async () => {
    mockMotion(true);
    render(<Fixture options={MANY} />);
    await waitFor(() => expect(hint()).toHaveAttribute('data-visible', 'true'));
    act(() => {
      screen.getByTestId('action-dial').dispatchEvent(
        new WheelEvent('wheel', {
          deltaY: 100,
          bubbles: true,
          cancelable: true,
        })
      );
    });
    expect(hint()).toHaveAttribute('data-visible', 'false');
  });
  it('is not retired by a plain tap on Stream Now', async () => {
    mockMotion(true);
    render(<Fixture />);
    await waitFor(() => expect(hint()).toHaveAttribute('data-visible', 'true'));
    fireEvent.click(link());
    expect(hint()).toHaveAttribute('data-visible', 'true');
  });
  it('survives blocked storage', async () => {
    mockMotion(true);
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    render(<Fixture />);
    await waitFor(() => expect(hint()).toHaveAttribute('data-visible', 'true'));
    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'ArrowDown' });
    expect(hint()).toHaveAttribute('data-visible', 'false');
  });
  it('plays one nudge on first view, none under reduced motion', async () => {
    mockMotion(false);
    const animate = vi.fn();
    HTMLElement.prototype.animate = animate;
    const first = render(<Fixture />);
    await waitFor(() => expect(animate).toHaveBeenCalledTimes(1));
    cleanupAnimate();
    first.unmount();
    localStorage.clear();
    mockMotion(true);
    const none = vi.fn();
    HTMLElement.prototype.animate = none;
    render(<Fixture />);
    await waitFor(() => expect(hint()).toHaveAttribute('data-visible', 'true'));
    expect(none).not.toHaveBeenCalled();
    cleanupAnimate();
  });
});

function cleanupAnimate() {
  // @ts-expect-error jsdom has no Element.animate; restore that.
  delete HTMLElement.prototype.animate;
}

describe('ActionDial edge cases', () => {
  it('shows a lone service without a reel or listbox', () => {
    render(<Fixture options={OPTIONS.slice(0, 1)} />);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('action-dial-icon-track')
    ).not.toBeInTheDocument();
    expect(link()).toHaveAttribute('href', 'https://open.spotify.com/song');
    expect(
      screen.getByText('Swipe to switch. Your choice is remembered.')
    ).toBeInTheDocument();
  });
  it('omits an iconless active slot', () => {
    render(
      <ActionDial
        options={[OPTIONS[0]!, { id: 'audius', label: 'Audius' }]}
        selectedId='audius'
        onSelect={vi.fn()}
        actionLabel='Stream Now'
        groupLabel='Choose a streaming service'
      />
    );
    expect(
      screen.queryByTestId('action-dial-icon-track')
    ).not.toBeInTheDocument();
  });
  it('follows an externally changed selection without a haptic', async () => {
    mockMotion(true);
    const vibrate = vi.fn();
    Object.defineProperty(navigator, 'vibrate', {
      configurable: true,
      value: vibrate,
    });
    const view = render(
      <ActionDial
        options={OPTIONS}
        selectedId='spotify'
        onSelect={vi.fn()}
        actionLabel='Stream Now'
        groupLabel='G'
      />
    );
    view.rerender(
      <ActionDial
        options={OPTIONS}
        selectedId='deezer'
        onSelect={vi.fn()}
        actionLabel='Stream Now'
        groupLabel='G'
      />
    );
    await waitFor(() =>
      expect(link()).toHaveAttribute('aria-label', 'Stream Now with Deezer')
    );
    expect(vibrate).not.toHaveBeenCalled();
    expect(
      screen.getByTestId('action-dial').getAttribute('data-position')
    ).toBe('2');
  });
  it('renders server markup that hydrates under reduced motion', () => {
    const html = renderToString(
      <ActionDial
        options={OPTIONS}
        selectedId='apple'
        onSelect={vi.fn()}
        actionLabel='Stream Now'
        groupLabel='G'
      />
    );
    expect(html).toContain('Stream Now with Apple Music');
    expect(html).toContain('role="listbox"');
    expect(html).toContain('data-visible="false"');
  });
  it('renders nothing for an empty list', () => {
    const { container } = render(
      <ActionDial
        options={[]}
        selectedId=''
        onSelect={vi.fn()}
        actionLabel='Stream Now'
        groupLabel='G'
      />
    );
    expect(container).toBeEmptyDOMElement();
  });
  it('keeps every row at least 44px tall by class', () => {
    render(<Fixture />);
    for (const row of screen.getAllByRole('option')) {
      expect(row).toHaveClass('h-11');
    }
  });
});
