'use client';

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';

interface ComposerFocusState {
  readonly isComposerFocused: boolean;
}

interface ComposerFocusDispatch {
  readonly setComposerFocused: (focused: boolean) => void;
}

const ComposerFocusStateContext = createContext<ComposerFocusState | null>(null);
const ComposerFocusDispatchContext = createContext<ComposerFocusDispatch | null>(
  null
);

export function ComposerFocusProvider({
  children,
}: {
  readonly children: ReactNode;
}) {
  const [isComposerFocused, setIsComposerFocused] = useState(false);

  const setComposerFocused = useCallback((focused: boolean) => {
    setIsComposerFocused(focused);
  }, []);

  const state = useMemo(
    () => ({ isComposerFocused }),
    [isComposerFocused]
  );
  const dispatch = useMemo(
    () => ({ setComposerFocused }),
    [setComposerFocused]
  );

  return (
    <ComposerFocusDispatchContext.Provider value={dispatch}>
      <ComposerFocusStateContext.Provider value={state}>
        {children}
      </ComposerFocusStateContext.Provider>
    </ComposerFocusDispatchContext.Provider>
  );
}

/** Read composer focus state — used by AuthShell to dim chrome. */
export function useComposerFocus(): ComposerFocusState {
  const ctx = useContext(ComposerFocusStateContext);
  return ctx ?? { isComposerFocused: false };
}

/** Register focus/blur from ChatInput without re-rendering on every keystroke. */
export function useRegisterComposerFocus(): ComposerFocusDispatch {
  const ctx = useContext(ComposerFocusDispatchContext);
  return {
    setComposerFocused: ctx?.setComposerFocused ?? (() => {}),
  };
}