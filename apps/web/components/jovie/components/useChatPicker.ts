'use client';

import { useCallback, useReducer } from 'react';
import type { EntityKind } from '@/lib/chat/tokens';

/**
 * State machine for the chat composer's slash picker.
 *
 * The picker has three observable states:
 *   - `closed`: no surface morph; composer is empty / typing.
 *   - `root`: user typed `/` at a word boundary; we show skills + entities
 *     (entity rows scope by current `query`).
 *   - `entity`: user picked a skill that needs an entity slot, or directly
 *     summoned an entity kind (`/release …`). The picker is locked to that
 *     kind until commit/close.
 *
 * `selectedIndex` lives in this reducer (not the menu) so keyboard nav inside
 * the menu and the menu's row count are guaranteed to stay in sync via
 * actions, not effects.
 */
export type PickerState =
  | { readonly status: 'closed' }
  | {
      readonly status: 'root';
      readonly query: string;
      readonly startIdx: number;
      readonly selectedIndex: number;
    }
  | {
      readonly status: 'entity';
      readonly kind: EntityKind;
      readonly query: string;
      readonly startIdx: number;
      readonly selectedIndex: number;
    };

type PickerAction =
  | {
      readonly type: 'open-root';
      readonly startIdx: number;
      readonly query: string;
    }
  | {
      readonly type: 'open-entity';
      readonly kind: EntityKind;
      readonly startIdx: number;
      readonly query: string;
    }
  | { readonly type: 'set-query'; readonly query: string }
  | { readonly type: 'set-selected'; readonly index: number }
  | {
      readonly type: 'move-selected';
      readonly delta: number;
      readonly max: number;
    }
  | { readonly type: 'close' };

const CLOSED: PickerState = { status: 'closed' };

function clampSelectedIndex(value: number, max: number): number {
  if (max <= 0) return 0;
  return Math.max(0, Math.min(max - 1, value));
}

function reducer(state: PickerState, action: PickerAction): PickerState {
  switch (action.type) {
    case 'open-root':
      return {
        status: 'root',
        query: action.query,
        startIdx: action.startIdx,
        selectedIndex: 0,
      };
    case 'open-entity':
      return {
        status: 'entity',
        kind: action.kind,
        query: action.query,
        startIdx: action.startIdx,
        selectedIndex: 0,
      };
    case 'set-query':
      if (state.status === 'closed') return state;
      // Reset selection on query change — list contents shift underneath.
      return { ...state, query: action.query, selectedIndex: 0 };
    case 'set-selected':
      if (state.status === 'closed') return state;
      return { ...state, selectedIndex: Math.max(0, action.index) };
    case 'move-selected':
      if (state.status === 'closed') return state;
      return {
        ...state,
        selectedIndex: clampSelectedIndex(
          state.selectedIndex + action.delta,
          action.max
        ),
      };
    case 'close':
      return CLOSED;
    default:
      return state;
  }
}

export interface UseChatPickerResult {
  readonly state: PickerState;
  readonly openRoot: (startIdx: number, query: string) => void;
  readonly openEntity: (
    kind: EntityKind,
    startIdx: number,
    query: string
  ) => void;
  readonly setQuery: (query: string) => void;
  readonly setSelected: (index: number) => void;
  readonly moveSelected: (delta: number, listLength: number) => void;
  readonly close: () => void;
}

export function useChatPicker(): UseChatPickerResult {
  const [state, dispatch] = useReducer(reducer, CLOSED);

  const openRoot = useCallback((startIdx: number, query: string) => {
    dispatch({ type: 'open-root', startIdx, query });
  }, []);

  const openEntity = useCallback(
    (kind: EntityKind, startIdx: number, query: string) => {
      dispatch({ type: 'open-entity', kind, startIdx, query });
    },
    []
  );

  const setQuery = useCallback((query: string) => {
    dispatch({ type: 'set-query', query });
  }, []);

  const setSelected = useCallback((index: number) => {
    dispatch({ type: 'set-selected', index });
  }, []);

  const moveSelected = useCallback((delta: number, listLength: number) => {
    dispatch({ type: 'move-selected', delta, max: listLength });
  }, []);

  const close = useCallback(() => {
    dispatch({ type: 'close' });
  }, []);

  return {
    state,
    openRoot,
    openEntity,
    setQuery,
    setSelected,
    moveSelected,
    close,
  };
}
