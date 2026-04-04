'use client';

import dynamic from 'next/dynamic';
import { useEffect, useMemo } from 'react';
import { usePreviewPanelState } from '@/app/app/(shell)/dashboard/PreviewPanelContext';
import { EntitySidebarShell } from '@/components/molecules/drawer';
import { ErrorBoundary } from '@/components/providers/ErrorBoundary';
import { useRegisterRightPanel } from '@/hooks/useRegisterRightPanel';
import { useChatEntityPanel } from './ChatEntityPanelContext';

const loadProfileContactSidebar = () =>
  import('@/features/dashboard/organisms/profile-contact-sidebar');

const ProfileContactSidebar = dynamic(
  () =>
    loadProfileContactSidebar().then(mod => ({
      default: mod.ProfileContactSidebar,
    })),
  {
    ssr: false,
    loading: () => (
      <EntitySidebarShell
        isOpen
        ariaLabel='Profile Contact'
        data-testid='profile-contact-sidebar'
        headerMode='minimal'
        hideMinimalHeaderBar
      >
        <div className='flex min-h-full flex-col gap-2.5 pt-0.5'>
          <div className='space-y-2.5 p-3'>
            <div className='grid grid-cols-2 gap-3'>
              <div className='space-y-1'>
                <div className='h-[9px] w-12 rounded skeleton' />
                <div className='h-4 w-8 rounded skeleton' />
              </div>
              <div className='space-y-1'>
                <div className='h-[9px] w-12 rounded skeleton' />
                <div className='h-4 w-8 rounded skeleton' />
              </div>
            </div>
            <div className='h-8 rounded-full skeleton' />
          </div>
        </div>
      </EntitySidebarShell>
    ),
  }
);

interface ChatEntityRightPanelHostProps {
  readonly enablePreviewPanel: boolean;
}

export function ChatEntityRightPanelHost({
  enablePreviewPanel,
}: Readonly<ChatEntityRightPanelHostProps>) {
  const { isOpen: isPreviewPanelOpen } = usePreviewPanelState();
  const { target } = useChatEntityPanel();

  useEffect(() => {
    if (!enablePreviewPanel) {
      return;
    }

    void loadProfileContactSidebar();
  }, [enablePreviewPanel]);

  const panel = useMemo(() => {
    if (target) {
      // Non-profile chat entity adapters land next. Until then, profile preview
      // remains the only active chat-owned right rail.
      return null;
    }

    if (!enablePreviewPanel || !isPreviewPanelOpen) {
      return null;
    }

    return (
      <ErrorBoundary fallback={null}>
        <ProfileContactSidebar />
      </ErrorBoundary>
    );
  }, [enablePreviewPanel, isPreviewPanelOpen, target]);

  useRegisterRightPanel(panel);

  return null;
}
