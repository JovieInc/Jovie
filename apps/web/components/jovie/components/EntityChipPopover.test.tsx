import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { fastRender } from '@/tests/utils/fast-render';
import { EntityChip } from './EntityChip';
import { EntityChipPopover } from './EntityChipPopover';

const mockEntityPanelState = vi.hoisted(() => ({
  entityPanel: null as null | { open: (payload: unknown) => void },
}));

vi.mock('@/app/app/(shell)/chat/ChatEntityPanelContext', () => ({
  useOptionalChatEntityPanel: () => mockEntityPanelState.entityPanel,
}));

vi.mock('@/components/atoms/ImageWithFallback', () => ({
  ImageWithFallback: ({
    alt,
    src,
  }: {
    readonly alt: string;
    readonly src?: string | null;
  }) => (src ? <img src={src} alt={alt} /> : null),
}));

function renderPopover(children?: ReactNode) {
  return fastRender(
    <EntityChipPopover
      kind='release'
      id='rel_1'
      label='Sober'
      entity={{ kind: 'release', id: 'rel_1', label: 'Sober' }}
    >
      {children ?? (
        <EntityChip
          data={{ kind: 'release', id: 'rel_1', label: 'Sober' }}
          variant='transcript'
        />
      )}
    </EntityChipPopover>
  );
}

function renderAdjacentPopovers() {
  return fastRender(
    <>
      {['Sober', 'Midnight Drive'].map((label, index) => {
        const id = `rel_${index}`;
        return (
          <EntityChipPopover
            key={id}
            kind='release'
            id={id}
            label={label}
            entity={{ kind: 'release', id, label }}
          >
            <span>{label}</span>
          </EntityChipPopover>
        );
      })}
      <button type='button'>Continue editing</button>
      <textarea aria-label='Chat draft' />
    </>
  );
}

describe('EntityChipPopover', () => {
  it('discloses on keyboard focus without moving focus into the card', async () => {
    renderPopover();
    await userEvent.setup().tab();
    expect(
      await screen.findByTestId('entity-chip-popover-content')
    ).toBeVisible();
    expect(screen.getByTestId('entity-chip-popover-trigger')).toHaveFocus();
  });
  beforeEach(() => {
    mockEntityPanelState.entityPanel = null;
  });

  function enterNeighborAndSettle(neighbor: HTMLElement) {
    // Only the hover delay is virtual. User-event and the Radix focus lifecycle
    // run on their normal clock before and after this pointer movement.
    vi.useFakeTimers();
    try {
      fireEvent.pointerOver(neighbor, { pointerType: 'mouse' });
      act(() => vi.advanceTimersByTime(300));
    } finally {
      vi.useRealTimers();
    }
  }

  it('keeps the keyboard-open inspection when the pointer passes a neighbor', async () => {
    const user = userEvent.setup();
    renderAdjacentPopovers();
    const first = screen.getByRole('button', { name: /Release: Sober/ });
    const second = screen.getByRole('button', {
      name: /Release: Midnight Drive/,
    });

    await user.tab();
    expect(first).toHaveFocus();
    expect(first).toHaveAttribute('aria-expanded', 'true');

    enterNeighborAndSettle(second);

    expect(first).toHaveFocus();
    expect(first).toHaveAttribute('aria-expanded', 'true');
    expect(second).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('dialog', { name: 'Sober' })).toBeVisible();
  });

  it('dismisses a passive hover with Escape without taking unrelated focus', async () => {
    const user = userEvent.setup();
    renderAdjacentPopovers();
    const trigger = screen.getByRole('button', { name: /Release: Sober/ });
    const outside = screen.getByRole('button', { name: 'Continue editing' });
    await user.click(outside);
    await user.hover(trigger);
    expect(await screen.findByRole('dialog', { name: 'Sober' })).toBeVisible();
    expect(outside).toHaveFocus();

    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(trigger).toHaveAttribute('aria-expanded', 'false');
      expect(outside).toHaveFocus();
    });
  });

  it('promotes a hover inspection on click until deliberately dismissed', async () => {
    const user = userEvent.setup();
    renderAdjacentPopovers();
    const first = screen.getByRole('button', { name: /Release: Sober/ });
    const second = screen.getByRole('button', {
      name: /Release: Midnight Drive/,
    });

    await user.hover(first);
    expect(await screen.findByRole('dialog', { name: 'Sober' })).toBeVisible();

    await user.click(first);
    enterNeighborAndSettle(second);

    expect(first).toHaveAttribute('aria-expanded', 'true');
    expect(second).toHaveAttribute('aria-expanded', 'false');

    await user.click(screen.getByRole('button', { name: 'Continue editing' }));
    expect(first).toHaveAttribute('aria-expanded', 'false');
  });

  it('returns focus to the trigger when Escape closes a focused preview action', async () => {
    const user = userEvent.setup();
    mockEntityPanelState.entityPanel = { open: vi.fn() };
    renderPopover();
    const trigger = screen.getByRole('button', { name: /Release: Sober/ });

    await user.tab();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('button', { name: 'Open Release' })).toHaveFocus();

    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(trigger).toHaveAttribute('aria-expanded', 'false');
      expect(trigger).toHaveFocus();
    });
  });

  it('preserves a newly focused draft during deferred Escape restoration', async () => {
    const user = userEvent.setup();
    mockEntityPanelState.entityPanel = { open: vi.fn() };
    renderAdjacentPopovers();
    const trigger = screen.getByRole('button', { name: /Release: Sober/ });
    const draft = screen.getByRole('textbox', { name: 'Chat draft' });
    await user.tab();
    await user.keyboard('{Enter}');
    const action = screen.getByRole('button', { name: 'Open Release' });
    expect(action).toHaveFocus();

    vi.useFakeTimers();
    try {
      fireEvent.keyDown(action, { key: 'Escape' });
      act(() => draft.focus());
      expect(draft).toHaveFocus();

      // Radix emits its real close autofocus callback on a timer after it
      // unmounts the focus scope. A real focus change may land first.
      act(() => vi.runOnlyPendingTimers());
      expect(trigger).toHaveAttribute('aria-expanded', 'false');
      expect(draft).toHaveFocus();
    } finally {
      vi.useRealTimers();
    }
  });

  it('exposes the trigger with proper aria semantics', () => {
    renderPopover();
    const trigger = screen.getByTestId('entity-chip-popover-trigger');
    expect(trigger.tagName).toBe('BUTTON');
    expect(trigger.getAttribute('aria-haspopup')).toBe('dialog');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    // The name now includes the rendered chip content (the sr-only action
    // prefix joins the visible label instead of an aria-label replacing it).
    expect(trigger.querySelector('.sr-only')?.textContent).toBe(
      'Release: Sober — '
    );
    expect(trigger).toHaveClass('system-b-entity-chip-trigger');
  });

  it('opens on click and reflects aria-expanded', async () => {
    const user = userEvent.setup();
    renderPopover();
    const trigger = screen.getByTestId('entity-chip-popover-trigger');
    await user.click(trigger);
    await waitFor(() =>
      expect(trigger.getAttribute('aria-expanded')).toBe('true')
    );
    expect(screen.getByTestId('entity-chip-popover-content')).toBeTruthy();
  });

  it('opens on mouse hover and closes after pointer leave', async () => {
    const user = userEvent.setup();
    renderPopover();
    const trigger = screen.getByTestId('entity-chip-popover-trigger');

    await user.hover(trigger);

    await waitFor(() =>
      expect(trigger.getAttribute('aria-expanded')).toBe('true')
    );
    expect(screen.getByTestId('entity-chip-popover-content')).toBeTruthy();

    await user.unhover(trigger);

    await waitFor(() =>
      expect(trigger.getAttribute('aria-expanded')).toBe('false')
    );
    expect(screen.queryByTestId('entity-chip-popover-content')).toBeNull();
  });

  it('opens on keyboard Enter', async () => {
    const user = userEvent.setup();
    renderPopover();
    const trigger = screen.getByTestId('entity-chip-popover-trigger');
    trigger.focus();
    await user.keyboard('{Enter}');
    await waitFor(() =>
      expect(trigger.getAttribute('aria-expanded')).toBe('true')
    );
  });

  it('opens on keyboard Space', async () => {
    const user = userEvent.setup();
    renderPopover();
    const trigger = screen.getByTestId('entity-chip-popover-trigger');
    trigger.focus();
    await user.keyboard(' ');
    await waitFor(() =>
      expect(trigger.getAttribute('aria-expanded')).toBe('true')
    );
  });

  it('closes on Escape and returns focus to trigger', async () => {
    const user = userEvent.setup();
    renderPopover();
    const trigger = screen.getByTestId('entity-chip-popover-trigger');
    await user.click(trigger);
    await waitFor(() =>
      expect(trigger.getAttribute('aria-expanded')).toBe('true')
    );
    await user.keyboard('{Escape}');
    await waitFor(() =>
      expect(trigger.getAttribute('aria-expanded')).toBe('false')
    );
    expect(document.activeElement).toBe(trigger);
  });

  it('lazy-mounts content: popover content is not in the DOM until open', () => {
    renderPopover();
    expect(screen.queryByTestId('entity-chip-popover-content')).toBeNull();
  });

  it('renders the canonical compact EntityCard when open', async () => {
    const user = userEvent.setup();
    renderPopover();
    await user.click(screen.getByTestId('entity-chip-popover-trigger'));
    const content = await screen.findByTestId('entity-chip-popover-content');
    expect(content.textContent).toContain('Sober');

    const card = screen.getByTestId('entity-chip-popover-card');
    expect(card).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Sober' })).toBeInTheDocument();
    expect(content.textContent).toContain('Release');
  });

  it('uses the canonical popover dialog for the compact entity card', async () => {
    const user = userEvent.setup();
    renderPopover();
    await user.click(screen.getByTestId('entity-chip-popover-trigger'));
    const content = await screen.findByTestId('entity-chip-popover-content');

    expect(content).toHaveAttribute('role', 'dialog');
    expect(screen.getByTestId('entity-chip-popover-card')).toBeTruthy();
  });

  it('renders the release panel action with System B casing and primitives', async () => {
    const user = userEvent.setup();
    const openEntityPanel = vi.fn();
    mockEntityPanelState.entityPanel = { open: openEntityPanel };

    renderPopover();
    await user.click(screen.getByTestId('entity-chip-popover-trigger'));

    const action = await screen.findByRole('button', {
      name: /Open Release/i,
    });
    expect(action).toHaveTextContent('Open Release');

    await user.click(action);

    expect(openEntityPanel).toHaveBeenCalledWith({
      kind: 'release',
      id: 'rel_1',
      label: 'Sober',
      source: 'manual',
      focusKey: 'release:rel_1:Sober',
    });
  });

  it('opens an event chip in the typed tour-date rail', async () => {
    const user = userEvent.setup();
    const openEntityPanel = vi.fn();
    mockEntityPanelState.entityPanel = { open: openEntityPanel };

    fastRender(
      <EntityChipPopover
        kind='event'
        id='evt_1'
        label='Brooklyn Bowl'
        entity={{ kind: 'event', id: 'evt_1', label: 'Brooklyn Bowl' }}
      >
        <span>Brooklyn Bowl</span>
      </EntityChipPopover>
    );
    await user.click(screen.getByTestId('entity-chip-popover-trigger'));
    await user.click(
      await screen.findByRole('button', { name: /Open Event/i })
    );

    expect(openEntityPanel).toHaveBeenCalledWith({
      kind: 'tour-date',
      id: 'evt_1',
      label: 'Brooklyn Bowl',
      source: 'manual',
      focusKey: 'event:evt_1:Brooklyn Bowl',
    });
  });

  it('presents a profile chip as the artist card marked as you', async () => {
    const user = userEvent.setup();
    mockEntityPanelState.entityPanel = { open: vi.fn() };
    fastRender(
      <EntityChipPopover
        kind='profile'
        id='p1'
        label='Tim White'
        entity={{ kind: 'profile', id: 'p1', label: 'Tim White' }}
      >
        <EntityChip
          data={{ kind: 'profile', id: 'p1', label: 'Tim White' }}
          variant='transcript'
        />
      </EntityChipPopover>
    );

    const trigger = screen.getByTestId('entity-chip-popover-trigger');
    expect(trigger.querySelector('.sr-only')?.textContent).toBe(
      'Profile: Tim White — '
    );

    await user.click(trigger);
    const content = await screen.findByTestId('entity-chip-popover-content');
    expect(content).toHaveAttribute('data-entity-kind', 'profile');
    expect(
      screen.getByRole('heading', { name: 'Tim White' })
    ).toBeInTheDocument();
    expect(content.textContent).toContain('Artist · You');
    // A profile has no entity rail to open, even when the panel is mounted.
    expect(screen.queryByRole('button', { name: /Open/i })).toBeNull();
  });

  it('degrades gracefully for unresolved entities without layout thrash', async () => {
    const user = userEvent.setup();
    fastRender(
      <EntityChipPopover kind='track' id='trk_missing' label='Unknown Track'>
        <EntityChip
          data={{ kind: 'track', id: 'trk_missing', label: 'Unknown Track' }}
          variant='transcript'
        />
      </EntityChipPopover>
    );

    await user.click(screen.getByTestId('entity-chip-popover-trigger'));
    const card = await screen.findByTestId('entity-chip-popover-card');
    expect(card.tagName).toBe('DIV');
    expect(screen.queryByText('Unknown Track')).toBeNull();
    expect(
      screen.getByRole('heading', { name: 'Unavailable reference' })
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Open/i })).toBeNull();
  });
});

describe('EntityChipPopover states', () => {
  it('renders the trigger as a plain button and stays axe-clean', async () => {
    const { container } = renderPopover();
    const trigger = screen.getByTestId('entity-chip-popover-trigger');
    expect(trigger).toHaveAttribute('data-slot', 'plain-button');
    expect(trigger).toHaveAttribute('type', 'button');
    await expectNoA11yViolations(container);
  });

  it('keeps an unavailable reference axe-clean and discloses it on click', async () => {
    const { container } = fastRender(
      <EntityChipPopover kind='release' id='rel_missing' label='Gone'>
        <EntityChip
          data={{ kind: 'release', id: 'rel_missing', label: 'Gone' }}
          variant='transcript'
        />
      </EntityChipPopover>
    );
    await userEvent
      .setup()
      .click(screen.getByTestId('entity-chip-popover-trigger'));
    expect(screen.getByTestId('entity-chip-popover-trigger')).toHaveAttribute(
      'aria-expanded',
      'true'
    );
    await expectNoA11yViolations(container);
  });

  it('keeps a very long label inside the trigger name', async () => {
    const label = 'A very long release title '.repeat(12).trim();
    const { container } = fastRender(
      <EntityChipPopover
        kind='release'
        id='rel_1'
        label={label}
        entity={{ kind: 'release', id: 'rel_1', label }}
      >
        <EntityChip
          data={{ kind: 'release', id: 'rel_1', label }}
          variant='transcript'
        />
      </EntityChipPopover>
    );
    expect(screen.getByTestId('entity-chip-popover-trigger')).toHaveTextContent(
      label
    );
    await expectNoA11yViolations(container);
  });
});
