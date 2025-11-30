'use client';

import { ChatBubbleBottomCenterTextIcon } from '@heroicons/react/24/outline';
import { Tooltip, TooltipContent, TooltipTrigger } from '@jovie/ui';
import { useCallback, useState } from 'react';
import { trackEvent } from '@/lib/analytics/runtime-aware';
import { cn } from '@/lib/utils';
import { FeedbackModal } from './FeedbackModal';

interface FeedbackButtonProps {
  collapsed?: boolean;
}

export function FeedbackButton({ collapsed = false }: FeedbackButtonProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleFeedbackClick = useCallback(() => {
    // Track via analytics wrapper (no direct posthog-js import)
    void trackEvent('sidebar_feedback_button_click', {
      sidebar_collapsed: collapsed,
      source: 'dashboard_sidebar',
    });

    setIsModalOpen(true);
  }, [collapsed]);

  const handleModalClose = useCallback(() => {
    setIsModalOpen(false);
  }, []);

  const buttonContent = (
    <button
      onClick={handleFeedbackClick}
      className={cn(
        'group flex items-center rounded-md border border-subtle bg-surface-1 text-secondary-token',
        collapsed
          ? 'justify-center w-8 h-8 p-0 gap-0'
          : 'w-full h-8 px-3 gap-2',
        'transition-colors duration-150 ease-out hover:bg-surface-2 hover:text-primary-token'
      )}
      aria-label={collapsed ? 'Send feedback' : undefined}
      aria-haspopup='dialog'
      aria-expanded={isModalOpen}
    >
      <ChatBubbleBottomCenterTextIcon
        className={cn(
          'h-4 w-4 shrink-0 text-tertiary-token group-hover:text-primary-token transition-colors duration-150',
          collapsed ? 'mx-auto my-auto' : ''
        )}
      />
      <span
        className={cn(
          'text-xs font-medium transition-all duration-200 ease-in-out',
          collapsed
            ? 'opacity-0 w-0 overflow-hidden'
            : 'opacity-100 w-auto leading-none'
        )}
      >
        Feedback
      </span>
    </button>
  );

  // In collapsed mode, wrap with tooltip
  if (collapsed) {
    return (
      <>
        <Tooltip>
          <TooltipTrigger asChild>{buttonContent}</TooltipTrigger>
          <TooltipContent side='right'>Send feedback</TooltipContent>
        </Tooltip>
        <FeedbackModal isOpen={isModalOpen} onClose={handleModalClose} />
      </>
    );
  }

  return (
    <>
      {buttonContent}
      <FeedbackModal isOpen={isModalOpen} onClose={handleModalClose} />
    </>
  );
}
