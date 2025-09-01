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
        'flex items-center gap-2 transition-all duration-200 ease-in-out group',
        'text-secondary-token hover:text-primary-token',
        'rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1',
        'bg-surface-1 hover:bg-surface-2 border border-default/30 hover:border-default/50',
        'hover:shadow-sm hover:scale-105 active:scale-95',
        collapsed ? 'justify-center h-8 w-8' : 'w-full px-3 py-2 h-8'
      )}
      aria-label={collapsed ? 'Send feedback' : undefined}
    >
      <ChatBubbleBottomCenterTextIcon className='h-4 w-4 shrink-0 text-emerald-500 group-hover:text-emerald-400 transition-colors duration-200' />
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
