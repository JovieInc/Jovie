import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ActionDial, type ActionDialOption } from './ActionDial';

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

function dispatchTouchPointer(
  target: HTMLElement,
  type: string,
  clientY: number
) {
  const event = new MouseEvent(type, { bubbles: true, clientY });
  Object.defineProperties(event, {
    pointerId: { value: 1 },
    pointerType: { value: 'touch' },
  });
  fireEvent(target, event);
}

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
  vi.unstubAllGlobals();
});

describe('ActionDial', () => {
  it('brings the other icon from above for a downward two-provider swipe', () => {
    render(
      <ActionDial
        options={OPTIONS.slice(0, 2)}
        selectedId='spotify'
        onSelect={vi.fn()}
        actionLabel='Stream Now'
        groupLabel='Choose a streaming service'
      />
    );
    const dial = screen.getByRole('group', {
      name: 'Choose a streaming service',
    });
    dispatchTouchPointer(dial, 'pointerdown', 120);
    dispatchTouchPointer(dial, 'pointermove', 154);
    expect(screen.getByTestId('action-dial-icon-apple')).toHaveStyle({
      transform: 'translateY(-50%)',
    });
  });
  it('settles the adjacent icon shown during a long swipe', () => {
    vi.useFakeTimers();
    const onSelect = vi.fn();
    render(<Fixture onSelect={onSelect} />);
    const dial = screen.getByRole('group', {
      name: 'Choose a streaming service',
    });
    dispatchTouchPointer(dial, 'pointerdown', 220);
    dispatchTouchPointer(dial, 'pointermove', 80);
    dispatchTouchPointer(dial, 'pointerup', 80);
    act(() => vi.advanceTimersByTime(180));
    expect(onSelect).toHaveBeenCalledWith('apple');
  });
  it('keeps a lone provider icon fixed and omits an iconless active slot', () => {
    const view = render(
      <ActionDial
        options={OPTIONS.slice(0, 1)}
        selectedId='spotify'
        onSelect={vi.fn()}
        actionLabel='Stream Now'
        groupLabel='Choose a streaming service'
      />
    );
    expect(
      screen.queryByTestId('action-dial-icon-track')
    ).not.toBeInTheDocument();
    view.rerender(
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
    dispatchTouchPointer(dial, 'pointerdown', 120);
    dispatchTouchPointer(dial, 'pointermove', 60);
    dispatchTouchPointer(dial, 'pointerup', 60);
    act(() => vi.advanceTimersByTime(180));
    expect(onSelect).toHaveBeenCalledWith('apple');
  });

  it('couples both CTA icons to touch drag progress and reverses without desync', () => {
    render(<Fixture />);
    const dial = screen.getByRole('group', {
      name: 'Choose a streaming service',
    });
    const spotify = screen.getByTestId('action-dial-icon-spotify');
    const apple = screen.getByTestId('action-dial-icon-apple');

    dispatchTouchPointer(dial, 'pointerdown', 120);
    dispatchTouchPointer(dial, 'pointermove', 86);
    expect(spotify).toHaveStyle({ transform: 'translateY(-50%)' });
    expect(apple).toHaveStyle({ transform: 'translateY(50%)' });

    dispatchTouchPointer(dial, 'pointermove', 103);
    expect(spotify).toHaveStyle({ transform: 'translateY(-25%)' });
    expect(apple).toHaveStyle({ transform: 'translateY(75%)' });

    dispatchTouchPointer(dial, 'pointerup', 120);
    expect(spotify).toHaveStyle({ transform: 'translateY(0%)' });
    expect(apple).toHaveStyle({ transform: 'translateY(100%)' });
  });

  it('settles a successful drag from its current CTA icon positions', () => {
    vi.useFakeTimers();
    render(<Fixture />);
    const dial = screen.getByRole('group', {
      name: 'Choose a streaming service',
    });

    dispatchTouchPointer(dial, 'pointerdown', 120);
    dispatchTouchPointer(dial, 'pointermove', 60);
    const progress = (id: string) =>
      Number(
        screen
          .getByTestId(`action-dial-icon-${id}`)
          .style.transform.match(/translateY\(([-\d.]+)%\)/)?.[1]
      );
    expect(progress('spotify')).toBeCloseTo(-88.23529411764706, 10);
    expect(progress('apple')).toBeCloseTo(11.764705882352942, 10);

    dispatchTouchPointer(dial, 'pointerup', 60);
    expect(screen.getByTestId('action-dial-icon-spotify')).toHaveStyle({
      transform: 'translateY(-100%)',
    });
    expect(screen.getByTestId('action-dial-icon-apple')).toHaveStyle({
      transform: 'translateY(0%)',
    });
  });

  it('keeps reduced-motion icon changes discrete', () => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true }));
    render(<Fixture />);

    expect(
      screen.queryByTestId('action-dial-icon-track')
    ).not.toBeInTheDocument();
    expect(screen.getByText('Spotify icon')).toBeInTheDocument();
  });

  it('keeps server markup compatible with reduced-motion hydration', () => {
    const markup = renderToString(<Fixture />);

    expect(markup).not.toContain('action-dial-icon-track');
    expect(markup).toContain('Spotify icon');
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

  it('uses the compact frame for one method and disables Pay while it is unavailable', () => {
    render(
      <ActionDial
        options={[{ id: 'stripe', label: 'Apple Pay / Card' }]}
        selectedId='stripe'
        onSelect={vi.fn()}
        onActivate={vi.fn()}
        actionLabel='Pay $5'
        groupLabel='Choose a payment method'
        disabled
      />
    );

    const action = screen.getByRole('button', {
      name: 'Pay $5 with Apple Pay / Card',
    });
    expect(action).toBeDisabled();
    expect(action.className).toContain('top-3');
    expect(action.className).not.toContain('top-20');
    expect(action.parentElement?.className).toContain('h-19');
    expect(action.parentElement?.className).not.toContain('h-53');
  });

  it('keeps the hint text on a token that clears image-contrast (JOV-INV-019)', () => {
    render(
      <ActionDial
        options={[{ id: 'venmo', label: 'Venmo' }]}
        selectedId='venmo'
        onSelect={vi.fn()}
        actionLabel='Continue'
        groupLabel='Choose a payment method'
        hint='Enter the amount in Venmo before sending.'
      />
    );

    // text-muted-foreground (= text-secondary-token) measured 4.48:1 against
    // a real photo background on the Pay drawer; text-primary-token clears
    // it with margin.
    expect(
      screen.getByText('Enter the amount in Venmo before sending.')
    ).toHaveClass('text-primary-token');
  });
});
