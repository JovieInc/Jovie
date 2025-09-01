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
        'flex items-center gap-2 transition-all duration-200 ease-in-out',
        'text-tertiary-token hover:text-secondary-token hover:bg-surface-2/50',
        'rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1',
        'group relative overflow-hidden',
        collapsed ? 'justify-center p-2' : 'w-full px-3 py-2'
      )}
      aria-label={collapsed ? 'Send feedback' : undefined}
    >
      <ChatBubbleBottomCenterTextIcon className='h-3.5 w-3.5 shrink-0 transition-colors duration-200' />
      <span
        className={cn(
          'text-xs font-medium transition-all duration-200 ease-in-out',
          collapsed ? 'opacity-0 w-0 overflow-hidden' : 'opacity-100 w-auto'
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
