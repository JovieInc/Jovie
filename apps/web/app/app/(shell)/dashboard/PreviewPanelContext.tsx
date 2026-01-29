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

interface PreviewPanelContextValue {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
  previewData: PreviewPanelData | null;
  setPreviewData: (data: PreviewPanelData) => void;
}

const PreviewPanelContext = createContext<PreviewPanelContextValue | null>(
  null
);

interface PreviewPanelProviderProps {
  children: React.ReactNode;
  defaultOpen?: boolean;
  enabled?: boolean;
}

export function PreviewPanelProvider({
  children,
  defaultOpen = false,
  enabled = true,
}: PreviewPanelProviderProps) {
  // Check if screen is large (md breakpoint: 768px)
  const [isLargeScreen, setIsLargeScreen] = useState(() => {
    if (typeof window === 'undefined') return true; // SSR default
    return window.matchMedia('(min-width: 768px)').matches;
  });

  // Update isLargeScreen on resize
  useEffect(() => {
    const mediaQuery = window.matchMedia('(min-width: 768px)');
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

  // Keyboard shortcut: spacebar toggles preview panel
  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      // Only trigger if spacebar and not typing in an input/textarea
      if (event.code === 'Space' || event.key === ' ') {
        const target = event.target as HTMLElement;
        const isTyping =
          target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable;

        if (!isTyping) {
          event.preventDefault();
          setIsOpen(prev => !prev);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enabled]);

  const value = useMemo<PreviewPanelContextValue>(
    () => ({
      isOpen: effectiveIsOpen,
      open,
      close,
      toggle,
      previewData,
      setPreviewData,
    }),
    [effectiveIsOpen, open, close, toggle, previewData]
  );

  return (
    <PreviewPanelContext.Provider value={value}>
      {children}
    </PreviewPanelContext.Provider>
  );
}

export function usePreviewPanel(): PreviewPanelContextValue {
  const context = useContext(PreviewPanelContext);
  if (!context) {
    throw new Error(
      'usePreviewPanel must be used within a PreviewPanelProvider'
    );
  }
  return context;
}

export function usePreviewPanelContext(): PreviewPanelContextValue | null {
  return useContext(PreviewPanelContext);
}
