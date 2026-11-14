import { Button, Input } from '@jovie/ui';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { SwipeToReveal, SwipeToRevealGroup } from './SwipeToReveal';

let clock = Date.UTC(2026, 0, 1, 12);

function swipe(target: HTMLElement, dx: number, dy = 0) {
  fireEvent.touchStart(target, { touches: [{ clientX: 200, clientY: 50 }] });
  clock += 500;
  fireEvent.touchMove(target, {
    touches: [{ clientX: 200 + dx, clientY: 50 + dy }],
  });
  fireEvent.touchEnd(target);
}

async function finishClosing(name: string) {
  await waitFor(() => {
    expect(screen.queryByRole('button', { name })).toBeNull();
  });
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('SwipeToReveal gestures', () => {
  beforeEach(() => {
    clock = Date.UTC(2026, 0, 1, 12);
    vi.spyOn(Date, 'now').mockImplementation(() => clock);
  });

  it('reveals an action after a deliberate swipe and lets the user activate it', async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    const onDelete = vi.fn();
    render(
      <SwipeToReveal
        forceEnabled
        onOpen={onOpen}
        actions={<Button onClick={onDelete}>Delete link</Button>}
      >
        <span>Spotify</span>
      </SwipeToReveal>
    );
    expect(screen.queryByRole('button', { name: 'Delete link' })).toBeNull();
    swipe(screen.getByText('Spotify'), -60);
    expect(onOpen).toHaveBeenCalledOnce();
    await user.click(screen.getByRole('button', { name: 'Delete link' }));
    expect(onDelete).toHaveBeenCalledOnce();
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it.each([
    { gesture: 'short horizontal drag', dx: -20, dy: 0 },
    { gesture: 'vertical scroll', dx: -10, dy: 60 },
  ])('keeps actions closed after a $gesture', async ({ dx, dy }) => {
    const onOpen = vi.fn();
    render(
      <SwipeToReveal
        forceEnabled
        onOpen={onOpen}
        actions={<Button>Edit</Button>}
      >
        <span>Spotify</span>
      </SwipeToReveal>
    );
    swipe(screen.getByText('Spotify'), dx, dy);
    await finishClosing('Edit');
    expect(onOpen).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
  });

  it('closes on an outside touch, then can reopen and close with a right swipe', async () => {
    const onOpen = vi.fn();
    const onClose = vi.fn();
    render(
      <SwipeToReveal
        forceEnabled
        onOpen={onOpen}
        onClose={onClose}
        actions={<Button>Edit</Button>}
      >
        <span>Spotify</span>
      </SwipeToReveal>
    );
    const row = screen.getByText('Spotify');
    swipe(row, -60);
    fireEvent.touchStart(row);
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.touchStart(document.body);
    await finishClosing('Edit');
    expect(onClose).toHaveBeenCalledOnce();
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
    swipe(row, -60);
    expect(onOpen).toHaveBeenCalledTimes(2);
    swipe(row, 70);
    await finishClosing('Edit');
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
  });

  it('keeps only the latest row open in a swipe group', async () => {
    const firstClose = vi.fn();
    render(
      <div onTouchStart={event => event.stopPropagation()}>
        <SwipeToRevealGroup>
          <SwipeToReveal
            forceEnabled
            itemId='first'
            onClose={firstClose}
            actions={<Button>Edit Spotify</Button>}
          >
            <span>Spotify</span>
          </SwipeToReveal>
          <SwipeToReveal
            forceEnabled
            itemId='second'
            actions={<Button>Edit Apple Music</Button>}
          >
            <span>Apple Music</span>
          </SwipeToReveal>
        </SwipeToRevealGroup>
      </div>
    );
    swipe(screen.getByText('Spotify'), -60);
    expect(
      screen.getByRole('button', { name: 'Edit Spotify' })
    ).toBeInTheDocument();
    const secondRow = screen.getByText('Apple Music');
    // The parent stops the document's outside-touch listener, so only the
    // group's open-row change can dismiss the first row in this test.
    fireEvent.touchStart(secondRow, {
      touches: [{ clientX: 200, clientY: 50 }],
    });
    expect(firstClose).not.toHaveBeenCalled();
    expect(
      screen.getByRole('button', { name: 'Edit Spotify' })
    ).toBeInTheDocument();
    clock += 500;
    fireEvent.touchMove(secondRow, {
      touches: [{ clientX: 140, clientY: 50 }],
    });
    fireEvent.touchEnd(secondRow);
    await finishClosing('Edit Spotify');
    expect(firstClose).toHaveBeenCalledOnce();
    expect(screen.queryByRole('button', { name: 'Edit Spotify' })).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Edit Apple Music' })
    ).toBeInTheDocument();
  });

  it('retains typed input and focus through rerender, opening, Escape and closing', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <SwipeToReveal forceEnabled actions={<Button>Remove</Button>}>
        <Input aria-label='Link title' />
      </SwipeToReveal>
    );
    const input = screen.getByRole('textbox', { name: 'Link title' });
    await user.type(input, 'Tour playlist');
    swipe(input, -60);
    rerender(
      <SwipeToReveal
        forceEnabled
        itemId='edited'
        actions={<Button>Remove</Button>}
      >
        <Input aria-label='Link title' />
      </SwipeToReveal>
    );
    await user.keyboard('{Escape}');
    expect(input).toHaveValue('Tour playlist');
    expect(input).toHaveFocus();
    swipe(input, 70);
    await finishClosing('Remove');
    expect(input).toHaveValue('Tour playlist');
    expect(input).toHaveFocus();
    expect(screen.queryByRole('button', { name: 'Remove' })).toBeNull();
  });
});

describe('SwipeToReveal accessibility', () => {
  it('has no axe violations with revealed actions', async () => {
    clock = Date.UTC(2026, 0, 1, 12);
    vi.spyOn(Date, 'now').mockImplementation(() => clock);
    const { container } = render(
      <SwipeToReveal forceEnabled actions={<Button>Edit link</Button>}>
        <span>Spotify</span>
      </SwipeToReveal>
    );
    swipe(screen.getByText('Spotify'), -60);
    expect(
      screen.getByRole('button', { name: 'Edit link' })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it.each([
    { state: 'non-touch', forceEnabled: false, label: 'Spotify', dir: 'ltr' },
    { state: 'touch', forceEnabled: true, label: 'Spotify', dir: 'ltr' },
    { state: 'empty', forceEnabled: true, label: '', dir: 'ltr' },
    {
      state: 'partial',
      forceEnabled: true,
      label: 'Untitled link',
      dir: 'ltr',
    },
    {
      state: 'long content',
      forceEnabled: true,
      label:
        'A playlist with all of the songs from the upcoming international tour',
      dir: 'ltr',
    },
    {
      state: 'RTL',
      forceEnabled: true,
      label: 'قائمة أغاني الجولة الموسيقية القادمة',
      dir: 'rtl',
    },
  ])(
    'has no axe violations in the $state state',
    async ({ forceEnabled, label, dir }) => {
      const { container } = render(
        <div dir={dir}>
          <SwipeToReveal
            forceEnabled={forceEnabled}
            actions={<Button>Edit link</Button>}
          >
            {label ? <span>{label}</span> : null}
          </SwipeToReveal>
        </div>
      );
      await expectNoA11yViolations(container);
    }
  );
});
