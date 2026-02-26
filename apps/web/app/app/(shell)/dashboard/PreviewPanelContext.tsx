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
  verificationStatus?: 'unverified' | 'pending' | 'verified';
}

export interface PreviewPanelData {
  username: string;
  displayName: string;
  avatarUrl: string | null;
  links: PreviewPanelLink[];
  profilePath: string;
  dspConnections: {
    spotify: {
      connected: boolean;
      artistName: string | null;
    };
    appleMusic: {
      connected: boolean;
      artistName: string | null;
    };
  };
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
  // Check if screen is large (md breakpoint: 768px).
  // Default to false during SSR to avoid hydration mismatch on mobile devices
  // (server would render panel open, client would compute closed).
  const [isLargeScreen, setIsLargeScreen] = useState(false);

  // After mount, read the actual screen size and listen for changes.
  // This ensures SSR and client initial render match (both start with isOpen=false),
  // then the effect opens the panel on large screens if defaultOpen is true.
  useEffect(() => {
    if (globalThis.window?.matchMedia === undefined) return;

    const mediaQuery = globalThis.window.matchMedia('(min-width: 768px)');
    setIsLargeScreen(mediaQuery.matches);

    const handleChange = (e: MediaQueryListEvent) => {
      setIsLargeScreen(e.matches);
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  // Start closed to match SSR; the effect below opens on large screens after hydration
  const [isOpen, setIsOpen] = useState(false);
  const [previewData, setPreviewData] = useState<PreviewPanelData | null>(null);

  // Open panel after mount on large screens when defaultOpen is requested.
  // Also close when switching to a small screen.
  useEffect(() => {
    if (defaultOpen && isLargeScreen) {
      setIsOpen(true);
    } else if (!isLargeScreen && isOpen) {
      setIsOpen(false);
    }
    // Intentionally omit isOpen to avoid re-triggering when user manually closes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLargeScreen, defaultOpen]);

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
 * @deprecated Prefer using {@link usePreviewPanelState} (for isOpen/open/close/toggle)
 * or {@link usePreviewPanelData} (for previewData/setPreviewData) to avoid
 * unnecessary re-renders from subscribing to both contexts.
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
