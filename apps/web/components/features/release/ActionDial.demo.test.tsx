import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ActionDial, type ActionDialOption } from './ActionDial';

const OPTIONS: ActionDialOption[] = Array.from({ length: 12 }, (_, i) => ({
  id: `s${i}`,
  label: `Service ${i}`,
  href: `https://example.com/${i}`,
}));

let observed: Array<(entries: Array<{ isIntersecting: boolean }>) => void> = [];

function Fixture({
  onActivate = vi.fn(),
  demo = true as boolean | { reveal?: boolean },
}) {
  const [selectedId, setSelectedId] = useState('s0');
  return (
    <ActionDial
      options={OPTIONS}
      selectedId={selectedId}
      onSelect={setSelectedId}
      onActivate={onActivate}
      actionLabel='Stream Now'
      groupLabel='Try it'
      demo={demo}
    />
  );
}

function mockMotion(reduced: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: reduced && query.includes('reduce'),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
}

const enterView = () =>
  act(() => {
    for (const callback of observed) callback([{ isIntersecting: true }]);
  });
// Advance in small steps so React flushes between frames, as a browser does.
const run = (ms: number) => {
  for (let elapsed = 0; elapsed < ms; elapsed += 100) {
    act(() => vi.advanceTimersByTime(100));
  }
};
const position = () =>
  Number(screen.getByTestId('action-dial').getAttribute('data-position'));

beforeEach(() => {
  observed = [];
  localStorage.clear();
  vi.useFakeTimers({
    toFake: [
      'setTimeout',
      'clearTimeout',
      'requestAnimationFrame',
      'cancelAnimationFrame',
      'performance',
    ],
  });
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(
        callback: (entries: Array<{ isIntersecting: boolean }>) => void
      ) {
        observed.push(callback);
      }
      observe() {}
      disconnect() {}
    }
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('ActionDial demo mode', () => {
  it('renders Stream Now as an inert button with no outbound link', () => {
    mockMotion(true);
    render(<Fixture />);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Stream Now with Service 0 \(demo/ })
    ).toBeInTheDocument();
    expect(document.querySelector('a[href]')).toBeNull();
  });
  it('never calls onActivate and shows a quiet demo note instead', () => {
    mockMotion(true);
    const onActivate = vi.fn();
    render(<Fixture onActivate={onActivate} />);
    fireEvent.click(screen.getByRole('button', { name: /Stream Now/ }));
    expect(onActivate).not.toHaveBeenCalled();
    expect(
      screen.getByText('This is a demo. No link opens.')
    ).toBeInTheDocument();
    run(2500);
    expect(
      screen.queryByText('This is a demo. No link opens.')
    ).not.toBeInTheDocument();
  });
  it('is still selectable by keyboard', () => {
    mockMotion(true);
    render(<Fixture />);
    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'ArrowDown' });
    expect(
      screen.getByRole('button', { name: /Service 1/ })
    ).toBeInTheDocument();
  });
  it('a normal dial still renders a link and activates', () => {
    mockMotion(true);
    const onActivate = vi.fn();
    render(<Fixture demo={false} onActivate={onActivate} />);
    fireEvent.click(
      screen.getByRole('link', { name: 'Stream Now with Service 0' })
    );
    expect(onActivate).toHaveBeenCalledWith('s0');
  });
});

describe('ActionDial demo reveal', () => {
  it('does nothing until it scrolls into view', () => {
    mockMotion(false);
    render(<Fixture />);
    run(3000);
    expect(position()).toBe(0);
  });
  it('flings out past several services, then back to the first', () => {
    mockMotion(false);
    render(<Fixture />);
    enterView();
    run(600);
    expect(screen.getByTestId('action-dial').getAttribute('data-state')).toBe(
      'release'
    );
    run(1200);
    expect(position()).toBeGreaterThan(2);
    run(9000);
    expect(position()).toBe(0);
    expect(
      screen.getByRole('button', { name: /Service 0/ })
    ).toBeInTheDocument();
  });
  it('plays only once', () => {
    mockMotion(false);
    render(<Fixture />);
    enterView();
    run(12000);
    enterView();
    run(600);
    expect(screen.getByTestId('action-dial').getAttribute('data-state')).toBe(
      'idle'
    );
  });
  it('a touch mid-reveal stops it and keeps the dial where it is', () => {
    mockMotion(false);
    render(<Fixture />);
    enterView();
    run(1100);
    const caught = position();
    expect(caught).toBeGreaterThan(0);
    const dial = screen.getByTestId('action-dial');
    const down = new MouseEvent('pointerdown', { bubbles: true, clientY: 100 });
    Object.defineProperties(down, {
      pointerId: { value: 1 },
      pointerType: { value: 'touch' },
    });
    fireEvent(dial, down);
    run(12000);
    expect(position()).toBe(caught);
  });
  it('a key press cancels the follow-up fling back', () => {
    mockMotion(false);
    render(<Fixture />);
    enterView();
    run(2800);
    expect(position()).toBeGreaterThan(5);
    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'ArrowUp' });
    run(12000);
    expect(position()).toBeGreaterThan(4);
  });
  it('does not auto-play under reduced motion but stays draggable', () => {
    mockMotion(true);
    render(<Fixture />);
    enterView();
    run(5000);
    expect(position()).toBe(0);
    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'End' });
    expect(position()).toBe(11);
  });
  it('can opt out of the reveal', () => {
    mockMotion(false);
    render(<Fixture demo={{ reveal: false }} />);
    expect(observed).toHaveLength(0);
    run(3000);
    expect(position()).toBe(0);
  });
  it('does not vibrate for the scripted reveal', () => {
    mockMotion(false);
    const vibrate = vi.fn();
    Object.defineProperty(navigator, 'vibrate', {
      configurable: true,
      value: vibrate,
    });
    render(<Fixture />);
    enterView();
    run(12000);
    expect(vibrate).not.toHaveBeenCalled();
  });
});
