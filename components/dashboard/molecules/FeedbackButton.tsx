'use client';

import { ChatBubbleBottomCenterTextIcon } from '@heroicons/react/24/outline';
import { useCallback, useState } from 'react';
import { SidebarMenuButton, useSidebar } from '@/components/organisms/Sidebar';
import { trackEvent } from '@/lib/analytics/runtime-aware';
import { FeedbackModal } from './FeedbackModal';

export function FeedbackButton() {
  const { state } = useSidebar();
  const isCollapsed = state === 'closed';
  const [isModalOpen, setIsModalOpen] = useState(false);
  const modalId = 'feedback-modal';

  const handleFeedbackClick = useCallback(() => {
    // Track via analytics wrapper (no direct posthog-js import)
    void trackEvent('sidebar_feedback_button_click', {
      sidebar_collapsed: isCollapsed,
      source: 'dashboard_sidebar',
    });

    setIsModalOpen(true);
  }, [isCollapsed]);

  const handleModalClose = useCallback(() => {
    setIsModalOpen(false);
  }, []);

  return (
    <>
      <SidebarMenuButton
        onClick={handleFeedbackClick}
        tooltip={isCollapsed ? 'Send feedback' : undefined}
        aria-haspopup='dialog'
        aria-controls={modalId}
      >
        <ChatBubbleBottomCenterTextIcon className='h-4 w-4 text-accent' />
        <span>Feedback</span>
      </SidebarMenuButton>
      <FeedbackModal
        isOpen={isModalOpen}
        onClose={handleModalClose}
        id={modalId}
      />
    </>
  );
}
