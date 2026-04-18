'use client';

import dynamic from 'next/dynamic';
import { useMemo } from 'react';
import { usePreviewPanelState } from '@/app/app/(shell)/dashboard/PreviewPanelContext';
import { ErrorBoundary } from '@/components/providers/ErrorBoundary';
import { useRegisterRightPanel } from '@/hooks/useRegisterRightPanel';
import { useChatEntityPanel } from './ChatEntityPanelContext';

const ProfileContactSidebar = dynamic(
  () =>
    import('@/features/dashboard/organisms/profile-contact-sidebar').then(
      mod => ({ default: mod.ProfileContactSidebar })
    ),
  { ssr: false }
);

interface ChatEntityRightPanelHostProps {
  readonly enablePreviewPanel: boolean;
}

export function ChatEntityRightPanelHost({
  enablePreviewPanel,
}: Readonly<ChatEntityRightPanelHostProps>) {
  const { isOpen: isPreviewPanelOpen } = usePreviewPanelState();
  const { target } = useChatEntityPanel();

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
