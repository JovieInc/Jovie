'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

export interface PreviewPanelLink {
  id: string;
  title: string;
  url: string;
  platform: string;
  isVisible: boolean;
}

export interface PreviewPanelData {
  username: string;
  displayName: string;
  avatarUrl: string | null;
  links: PreviewPanelLink[];
  profilePath: string;
}

// Split contexts to prevent cascading re-renders:
// - StateContext: isOpen, open, close, toggle (changes rarely)
// - DataContext: previewData, setPreviewData (changes frequently)

interface PreviewPanelStateContextValue {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
}

interface PreviewPanelDataContextValue {
  previewData: PreviewPanelData | null;
  setPreviewData: (data: PreviewPanelData) => void;
}

// Combined type for backwards compatibility
interface PreviewPanelContextValue
  extends PreviewPanelStateContextValue,
    PreviewPanelDataContextValue {}

const PreviewPanelStateContext =
  createContext<PreviewPanelStateContextValue | null>(null);
const PreviewPanelDataContext =
  createContext<PreviewPanelDataContextValue | null>(null);

interface PreviewPanelProviderProps {
  readonly children: React.ReactNode;
  readonly defaultOpen?: boolean;
  readonly enabled?: boolean;
}

export function PreviewPanelProvider({
  children,
  defaultOpen = false,
  enabled = true,
}: Readonly<PreviewPanelProviderProps>) {
  // Check if screen is large (md breakpoint: 768px)
  const [isLargeScreen, setIsLargeScreen] = useState(() => {
    if (globalThis.window?.matchMedia === undefined) return true; // SSR/test default
    return globalThis.window.matchMedia('(min-width: 768px)').matches;
  });

  // Update isLargeScreen on resize
  useEffect(() => {
    if (globalThis.window?.matchMedia === undefined) return;

    const mediaQuery = globalThis.window.matchMedia('(min-width: 768px)');
    const handleChange = (e: MediaQueryListEvent) => {
      setIsLargeScreen(e.matches);
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  // Use defaultOpen on large screens, false on small screens
  const initialOpen = defaultOpen && isLargeScreen;
  const [isOpen, setIsOpen] = useState(initialOpen);
  const [previewData, setPreviewData] = useState<PreviewPanelData | null>(null);

  // Update open state when screen size changes
  useEffect(() => {
    if (defaultOpen && !isLargeScreen && isOpen) {
      // Close drawer when switching to small screen
      setIsOpen(false);
    }
  }, [isLargeScreen, defaultOpen, isOpen]);

  const open = useCallback(() => {
    if (!enabled) return;
    setIsOpen(true);
  }, [enabled]);

  const close = useCallback(() => {
    if (!enabled) return;
    setIsOpen(false);
  }, [enabled]);

  const toggle = useCallback(() => {
    if (!enabled) return;
    setIsOpen(prev => !prev);
  }, [enabled]);

  const effectiveIsOpen = enabled ? isOpen : false;

  // Separate memoized values for each context to prevent cascading re-renders
  const stateValue = useMemo<PreviewPanelStateContextValue>(
    () => ({
      isOpen: effectiveIsOpen,
      open,
      close,
      toggle,
    }),
    [effectiveIsOpen, open, close, toggle]
  );

  const dataValue = useMemo<PreviewPanelDataContextValue>(
    () => ({
      previewData,
      setPreviewData,
    }),
    [previewData]
  );

  return (
    <PreviewPanelStateContext.Provider value={stateValue}>
      <PreviewPanelDataContext.Provider value={dataValue}>
        {children}
      </PreviewPanelDataContext.Provider>
    </PreviewPanelStateContext.Provider>
  );
}

/**
 * Hook for accessing preview panel state (isOpen, open, close, toggle).
 * Use this when you only need to read/control the open state.
 * Components using this hook won't re-render when preview data changes.
 */
export function usePreviewPanelState(): PreviewPanelStateContextValue {
  const context = useContext(PreviewPanelStateContext);
  if (!context) {
    throw new TypeError(
      'usePreviewPanelState must be used within a PreviewPanelProvider'
    );
  }
  return context;
}

/**
 * Hook for accessing preview panel data (previewData, setPreviewData).
 * Use this when you need to read/write the preview data.
 * Components using this hook won't re-render when open state changes.
 */
export function usePreviewPanelData(): PreviewPanelDataContextValue {
  const context = useContext(PreviewPanelDataContext);
  if (!context) {
    throw new TypeError(
      'usePreviewPanelData must be used within a PreviewPanelProvider'
    );
  }
  return context;
}

/**
 * Combined hook for backwards compatibility.
 * Prefer using usePreviewPanelState or usePreviewPanelData for better performance.
 */
export function usePreviewPanel(): PreviewPanelContextValue {
  const stateContext = useContext(PreviewPanelStateContext);
  const dataContext = useContext(PreviewPanelDataContext);
  if (!stateContext || !dataContext) {
    throw new TypeError(
      'usePreviewPanel must be used within a PreviewPanelProvider'
    );
  }
  return { ...stateContext, ...dataContext };
}

/**
 * Optional context hook that returns null if not within provider.
 * For backwards compatibility with optional preview panel usage.
 */
export function usePreviewPanelContext(): PreviewPanelContextValue | null {
  const stateContext = useContext(PreviewPanelStateContext);
  const dataContext = useContext(PreviewPanelDataContext);
  if (!stateContext || !dataContext) {
    return null;
  }
  return { ...stateContext, ...dataContext };
}
