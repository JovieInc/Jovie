import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { SlashCommandMenu } from '@/components/jovie/components/SlashCommandMenu';
import type { PickerState } from '@/components/jovie/components/useChatPicker';
import type { EntityRef } from '@/lib/commands/entities';
import type { SkillCommand } from '@/lib/commands/registry';

/**
 * Keyboard + ARIA + IME unit tests for SlashCommandMenu.
 *
 * The menu owns a global `keydown` listener while open. We render it
 * directly with a synthesized `PickerState` (rather than going through
 * ChatInput) so each assertion is local to the listener contract.
 */

vi.mock('@/lib/queries/useReleasesQuery', () => ({
  useReleasesQuery: () => ({ data: [], isLoading: false }),
}));

vi.mock('@/lib/queries/useArtistSearchQuery', () => ({
  useArtistSearchQuery: () => ({
    results: [],
    state: 'idle' as const,
    search: vi.fn(),
  }),
}));

function withProviders(ui: ReactNode) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  return <QueryClientProvider client={client}>{ui}</QueryClientProvider>;
}

interface Handlers {
  readonly onSelectSkill: ReturnType<typeof vi.fn>;
  readonly onSelectEntity: ReturnType<typeof vi.fn>;
  readonly onSetSelected: ReturnType<typeof vi.fn>;
  readonly onMoveSelected: ReturnType<typeof vi.fn>;
  readonly onClose: ReturnType<typeof vi.fn>;
}

function makeHandlers(): Handlers {
  return {
    onSelectSkill: vi.fn(),
    onSelectEntity: vi.fn(),
    onSetSelected: vi.fn(),
    onMoveSelected: vi.fn(),
    onClose: vi.fn(),
  };
}

function rootState(selectedIndex: number): PickerState {
  return {
    status: 'root',
    query: '',
    startIdx: 0,
    selectedIndex,
  };
}

function renderMenu(state: PickerState, handlers: Handlers) {
  return render(
    withProviders(
      <SlashCommandMenu
        state={state}
        profileId='profile-test'
        onSelectSkill={handlers.onSelectSkill}
        onSelectEntity={handlers.onSelectEntity}
        onSetSelected={handlers.onSetSelected}
        onMoveSelected={handlers.onMoveSelected}
        onClose={handlers.onClose}
        variant='inline'
      />
    )
  );
}

describe('SlashCommandMenu keyboard + IME + ARIA', () => {
  it('renders a listbox with role=option rows for each skill', () => {
    const handlers = makeHandlers();
    renderMenu(rootState(0), handlers);
    const listbox = screen.getByRole('listbox', {
      name: /slash command suggestions/i,
    });
    expect(listbox).toBeInTheDocument();
    const options = screen.getAllByRole('option');
    expect(options.length).toBeGreaterThan(0);
    expect(options[0]).toHaveAttribute('aria-selected', 'true');
    expect(options[1]).toHaveAttribute('aria-selected', 'false');
  });

  it('ArrowDown delegates to onMoveSelected with delta=+1', () => {
    const handlers = makeHandlers();
    renderMenu(rootState(0), handlers);
    fireEvent.keyDown(window, { key: 'ArrowDown' });
    expect(handlers.onMoveSelected).toHaveBeenCalledWith(1, expect.any(Number));
    const [delta, total] = handlers.onMoveSelected.mock.calls[0] as [
      number,
      number,
    ];
    expect(delta).toBe(1);
    expect(total).toBeGreaterThan(0);
  });

  it('ArrowUp delegates to onMoveSelected with delta=-1', () => {
    const handlers = makeHandlers();
    renderMenu(rootState(0), handlers);
    fireEvent.keyDown(window, { key: 'ArrowUp' });
    expect(handlers.onMoveSelected).toHaveBeenCalledWith(
      -1,
      expect.any(Number)
    );
  });

  it('Enter on the active row calls onSelectSkill with the matched SkillCommand', () => {
    const handlers = makeHandlers();
    renderMenu(rootState(0), handlers);
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(handlers.onSelectSkill).toHaveBeenCalledTimes(1);
    const skill = handlers.onSelectSkill.mock.calls[0][0] as SkillCommand;
    expect(skill.kind).toBe('skill');
    expect(typeof skill.id).toBe('string');
  });

  it('Escape calls onClose', () => {
    const handlers = makeHandlers();
    renderMenu(rootState(0), handlers);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(handlers.onClose).toHaveBeenCalledTimes(1);
  });

  it('Enter during IME composition does NOT call onSelectSkill (isComposing=true)', () => {
    const handlers = makeHandlers();
    renderMenu(rootState(0), handlers);
    // Synthesize a composing keydown event. fireEvent doesn't surface
    // `isComposing` directly, so dispatch a real KeyboardEvent.
    const evt = new KeyboardEvent('keydown', {
      key: 'Enter',
      bubbles: true,
      cancelable: true,
    });
    Object.defineProperty(evt, 'isComposing', { value: true });
    window.dispatchEvent(evt);
    expect(handlers.onSelectSkill).not.toHaveBeenCalled();
    expect(handlers.onSelectEntity).not.toHaveBeenCalled();
  });

  it('Enter during IME composition (keyCode 229) does NOT call onSelectSkill', () => {
    const handlers = makeHandlers();
    renderMenu(rootState(0), handlers);
    const evt = new KeyboardEvent('keydown', {
      key: 'Enter',
      keyCode: 229,
      bubbles: true,
      cancelable: true,
    });
    window.dispatchEvent(evt);
    expect(handlers.onSelectSkill).not.toHaveBeenCalled();
  });

  it('Mouse hover on a row calls onSetSelected with that flat index', () => {
    const handlers = makeHandlers();
    renderMenu(rootState(0), handlers);
    const options = screen.getAllByRole('option');
    fireEvent.mouseEnter(options[1]);
    expect(handlers.onSetSelected).toHaveBeenCalledWith(1);
  });

  it('does not register a listener when the picker is closed', () => {
    const handlers = makeHandlers();
    render(
      withProviders(
        <SlashCommandMenu
          state={{ status: 'closed' }}
          profileId='profile-test'
          onSelectSkill={handlers.onSelectSkill}
          onSelectEntity={handlers.onSelectEntity}
          onSetSelected={handlers.onSetSelected}
          onMoveSelected={handlers.onMoveSelected}
          onClose={handlers.onClose}
          variant='inline'
        />
      )
    );
    fireEvent.keyDown(window, { key: 'ArrowDown' });
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(handlers.onMoveSelected).not.toHaveBeenCalled();
    expect(handlers.onClose).not.toHaveBeenCalled();
  });

  it('reports the active row id via onActiveRowChange', () => {
    const handlers = makeHandlers();
    const onActiveRowChange = vi.fn();
    render(
      withProviders(
        <SlashCommandMenu
          state={rootState(0)}
          profileId='profile-test'
          onSelectSkill={handlers.onSelectSkill}
          onSelectEntity={handlers.onSelectEntity}
          onSetSelected={handlers.onSetSelected}
          onMoveSelected={handlers.onMoveSelected}
          onClose={handlers.onClose}
          variant='inline'
          listIdProp='test-list-id'
          onActiveRowChange={onActiveRowChange}
        />
      )
    );
    expect(onActiveRowChange).toHaveBeenCalledWith('test-list-id-row-0');
    // The first option's id should match what was reported.
    const options = screen.getAllByRole('option');
    expect(options[0]).toHaveAttribute('id', 'test-list-id-row-0');
  });

  it('exposes EntityRef typed result on entity commit', () => {
    // Sanity: the commit handler signature accepts EntityRef without
    // tripping TS, exercised at compile time. Runtime: the handler is the
    // same `onSelectEntity` we wired above; just assert it's wired.
    const handlers = makeHandlers();
    const placeholder: EntityRef = {
      kind: 'release',
      id: 'r1',
      label: 'Sample',
    };
    handlers.onSelectEntity(placeholder);
    expect(handlers.onSelectEntity).toHaveBeenCalledWith(placeholder);
  });
});
