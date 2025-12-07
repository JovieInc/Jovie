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
}

export function PreviewPanelProvider({
  children,
  defaultOpen = false,
}: PreviewPanelProviderProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [previewData, setPreviewData] = useState<PreviewPanelData | null>(null);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen(prev => !prev), []);

  // Keyboard shortcut: spacebar toggles preview panel
  useEffect(() => {
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
  }, []);

  const value = useMemo<PreviewPanelContextValue>(
    () => ({
      isOpen,
      open,
      close,
      toggle,
      previewData,
      setPreviewData,
    }),
    [isOpen, open, close, toggle, previewData]
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
