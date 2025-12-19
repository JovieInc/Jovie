'use client';

import { usePathname } from 'next/navigation';
import { useTheme } from 'next-themes';
import { useCallback, useEffect } from 'react';
import { Footer } from '@/components/site/Footer';

export function MarketingFooter() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const pathname = usePathname();
  const shortcutKey = 'T';

  const toggleLightDark = useCallback(() => {
    const currentTheme = theme === 'system' ? resolvedTheme : theme;
    if (!currentTheme) return;

    const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
  }, [resolvedTheme, setTheme, theme]);

  useEffect(() => {
    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== 't') return;
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) {
        return;
      }
      if (event.repeat) return;

      const target = event.target as HTMLElement | null;
      const isEditableTarget =
        target?.closest(
          'input, textarea, [contenteditable="true"], [contenteditable=""], [contenteditable]'
        ) || target?.isContentEditable;

      if (isEditableTarget) return;

      event.preventDefault();
      toggleLightDark();
    };

    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, [toggleLightDark]);

  if (pathname === '/investors') {
    return <Footer version='minimal' themeShortcutKey={shortcutKey} />;
  }

  return <Footer brandingMark='icon' themeShortcutKey={shortcutKey} />;
}
