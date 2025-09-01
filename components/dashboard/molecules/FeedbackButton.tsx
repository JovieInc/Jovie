'use client';

import { ChatBubbleBottomCenterTextIcon } from '@heroicons/react/24/outline';
import { posthog } from 'posthog-js';
import { useCallback, useState } from 'react';
import { Tooltip } from '@/components/atoms/Tooltip';
import { cn } from '@/lib/utils';
import { FeedbackModal } from './FeedbackModal';

interface FeedbackButtonProps {
  collapsed?: boolean;
}

export function FeedbackButton({ collapsed = false }: FeedbackButtonProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleFeedbackClick = useCallback(() => {
    // Track the feedback button click
    posthog.capture('feedback_button_clicked', {
      sidebar_collapsed: collapsed,
      source: 'dashboard_sidebar',
    });

    // Open the custom modal
    setIsModalOpen(true);
  }, [collapsed]);

  const handleModalClose = useCallback(() => {
    setIsModalOpen(false);
  }, []);

  const buttonContent = (
    <button
      onClick={handleFeedbackClick}
      className={cn(
        'flex items-center gap-3 p-2 text-sm font-medium transition-all duration-300 ease-in-out',
        'text-secondary-token hover:text-primary-token hover:bg-surface-2',
        'rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2',
        collapsed ? 'justify-center w-8 h-8 p-1' : 'w-full'
      )}
      aria-label={collapsed ? 'Send feedback' : undefined}
    >
      <ChatBubbleBottomCenterTextIcon className='h-4 w-4 shrink-0 transition-colors duration-200' />
      {!collapsed && (
        <span
          className={cn(
            'transition-all duration-300 ease-in-out',
            collapsed ? 'opacity-0 w-0 overflow-hidden' : 'opacity-100 w-auto'
          )}
        >
          Send Feedback
        </span>
      )}
    </button>
  );

  // In collapsed mode, wrap with tooltip
  if (collapsed) {
    return (
      <>
        <Tooltip content='Send feedback' placement='right'>
          {buttonContent}
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
