'use client';

import { useEffect, useState } from 'react';
import { BrandLogo } from '@/components/atoms/BrandLogo';

/**
 * AuthLoader - Loading state that matches the final layout
 *
 * Key features:
 * - Logo offset right to accommodate sidebar (prevents layout shift)
 * - Sidebar skeleton on the left
 * - Matches the 3-panel structure of AuthShell
 * - Progressive message after 2 seconds
 *
 * Why offset right?
 * - Logo appears in the same position as final content
 * - No layout shift when content loads
 * - Visual continuity: sidebar → content
 */
export function AuthLoader() {
  const [showMessage, setShowMessage] = useState(false);

  useEffect(() => {
    // Show additional message after 2 seconds if still loading
    const timer = setTimeout(() => setShowMessage(true), 2000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className='flex h-svh w-full bg-base'>
      {/* Sidebar skeleton - matches UnifiedSidebar width */}
      <div className='w-[236px] bg-base border-r border-subtle' />

      {/* Main content area (offset for sidebar) */}
      <div className='flex-1 flex items-center justify-center'>
        <div className='flex flex-col items-center gap-4'>
          <BrandLogo size={64} className='animate-pulse' />
          {showMessage && (
            <p className='text-sm text-secondary-token animate-in fade-in'>
              Setting up your workspace...
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
