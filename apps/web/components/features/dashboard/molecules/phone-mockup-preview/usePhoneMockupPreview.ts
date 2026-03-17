'use client';

import { useEffect, useState } from 'react';
import type { PhoneMockupLink } from './types';

export interface UsePhoneMockupPreviewReturn {
  isLoaded: boolean;
  activeLink: string | null;
  setActiveLink: (id: string | null) => void;
  visibleLinks: PhoneMockupLink[];
}

export function usePhoneMockupPreview(
  links: PhoneMockupLink[]
): UsePhoneMockupPreviewReturn {
  const [isLoaded, setIsLoaded] = useState(false);
  const [activeLink, setActiveLink] = useState<string | null>(null);

  // Simulate loading state
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsLoaded(true);
    }, 300);

    return () => clearTimeout(timer);
  }, []);

  // Filter visible links
  const visibleLinks = links.filter(link => link.isVisible);

  return {
    isLoaded,
    activeLink,
    setActiveLink,
    visibleLinks,
  };
}
