'use client';

import { ChatBubbleBottomCenterTextIcon } from '@heroicons/react/24/outline';
import { useCallback, useState } from 'react';
import { controlClasses } from '@/components/atoms/ControlStyles';
import { Tooltip } from '@/components/atoms/Tooltip';
import { trackEvent } from '@/lib/analytics/runtime-aware';
import { cn } from '@/lib/utils';
import { FeedbackModal } from './FeedbackModal';

interface FeedbackButtonProps {
  collapsed?: boolean;
}

export function FeedbackButton({ collapsed = false }: FeedbackButtonProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const modalId = 'feedback-modal';

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
        'group flex transition-all duration-200 ease-in-out',
        controlClasses({ variant: 'neutral', size: 'sm' }),
        collapsed
          ? 'items-center justify-center w-8 h-8 p-0 gap-0'
          : 'items-center w-full px-3 gap-2',
        'hover:scale-105 active:scale-95',
        'motion-reduce:transform-none'
      )}
      aria-label={collapsed ? 'Send feedback' : undefined}
      aria-haspopup='dialog'
      aria-expanded={isModalOpen}
      aria-controls={modalId}
    >
      <ChatBubbleBottomCenterTextIcon
        className={cn(
          'h-4 w-4 shrink-0 text-emerald-500 group-hover:text-emerald-400 transition-colors duration-200',
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
        <Tooltip content='Send feedback' placement='right'>
          {buttonContent}
        </Tooltip>
        <FeedbackModal isOpen={isModalOpen} onClose={handleModalClose} id={modalId} />
      </>
    );
  }

  return (
    <>
      {buttonContent}
      <FeedbackModal isOpen={isModalOpen} onClose={handleModalClose} id={modalId} />
    </>
  );
}
