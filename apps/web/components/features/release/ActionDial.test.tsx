import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ActionDial, type ActionDialOption } from './ActionDial';

const OPTIONS: ActionDialOption[] = [
  { id: 'spotify', label: 'Spotify', href: 'https://open.spotify.com/song' },
  { id: 'apple', label: 'Apple Music', href: 'https://music.apple.com/song' },
  { id: 'deezer', label: 'Deezer', href: 'https://deezer.com/song' },
];

function Fixture({
  onSelect = vi.fn(),
}: {
  readonly onSelect?: (id: string) => void;
}) {
  const [selectedId, setSelectedId] = useState('spotify');
  return (
    <ActionDial
      options={OPTIONS}
      selectedId={selectedId}
      onSelect={id => {
        setSelectedId(id);
        onSelect(id);
      }}
      actionLabel='Stream Now'
      groupLabel='Choose a streaming service'
    />
  );
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('ActionDial', () => {
  it('keeps a fixed action while an adjacent tap settles the chosen service', () => {
    vi.useFakeTimers();
    const onSelect = vi.fn();
    render(<Fixture onSelect={onSelect} />);

    expect(
      screen.getByRole('link', { name: 'Stream Now with Spotify' })
    ).toHaveAttribute('href', 'https://open.spotify.com/song');
    fireEvent.click(screen.getByRole('button', { name: 'Select Apple Music' }));
    expect(onSelect).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(180));

    expect(onSelect).toHaveBeenCalledWith('apple');
    expect(
      screen.getByRole('link', { name: 'Stream Now with Apple Music' })
    ).toHaveAttribute('href', 'https://music.apple.com/song');
  });

  it('supports keyboard choice and triggers selection haptic on the user gesture', () => {
    vi.useFakeTimers();
    const vibrate = vi.fn();
    Object.defineProperty(navigator, 'vibrate', {
      configurable: true,
      value: vibrate,
    });
    const onSelect = vi.fn();
    render(<Fixture onSelect={onSelect} />);

    fireEvent.keyDown(
      screen.getByRole('group', { name: 'Choose a streaming service' }),
      {
        key: 'ArrowDown',
      }
    );
    expect(vibrate).toHaveBeenCalledWith([5]);
    act(() => vi.advanceTimersByTime(180));
    expect(onSelect).toHaveBeenCalledWith('apple');
  });

  it('swipes upward to the next service without activating the outgoing link', () => {
    vi.useFakeTimers();
    const onSelect = vi.fn();
    render(<Fixture onSelect={onSelect} />);
    const dial = screen.getByRole('group', {
      name: 'Choose a streaming service',
    });
    const dispatchPointer = (type: string, clientY: number) => {
      const event = new MouseEvent(type, { bubbles: true, clientY });
      Object.defineProperties(event, {
        pointerId: { value: 1 },
        pointerType: { value: 'touch' },
      });
      fireEvent(dial, event);
    };
    dispatchPointer('pointerdown', 120);
    dispatchPointer('pointermove', 60);
    dispatchPointer('pointerup', 60);
    act(() => vi.advanceTimersByTime(180));
    expect(onSelect).toHaveBeenCalledWith('apple');
  });

  it('selects an adjacent row on a captured pointer tap', () => {
    vi.useFakeTimers();
    const onSelect = vi.fn();
    render(<Fixture onSelect={onSelect} />);
    const row = screen.getByRole('button', { name: 'Select Apple Music' });
    const dispatchPointer = (type: string) => {
      const event = new MouseEvent(type, { bubbles: true, clientY: 120 });
      Object.defineProperties(event, {
        pointerId: { value: 1 },
        pointerType: { value: 'touch' },
      });
      fireEvent(row, event);
    };
    dispatchPointer('pointerdown');
    dispatchPointer('pointerup');
    act(() => vi.advanceTimersByTime(180));
    expect(onSelect).toHaveBeenCalledWith('apple');
  });
});
