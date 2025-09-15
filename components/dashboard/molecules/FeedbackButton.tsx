'use client';

import { ChatBubbleBottomCenterTextIcon } from '@heroicons/react/24/outline';
import { Button, Tooltip, TooltipContent, TooltipTrigger } from '@jovie/ui';
import { useCallback, useMemo, useState } from 'react';
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

  const icon = useMemo(
    () => (
      <ChatBubbleBottomCenterTextIcon
        className={cn(
          'h-4 w-4 transition-colors duration-200',
          collapsed
            ? 'text-emerald-400'
            : 'text-emerald-500 group-hover:text-emerald-400'
        )}
      />
    ),
    [collapsed]
  );

  const buttonContent = (
    <Button
      type='button'
      variant='ghost'
      size={collapsed ? 'icon' : 'sm'}
      onClick={handleFeedbackClick}
      aria-label={collapsed ? 'Send feedback' : undefined}
      aria-haspopup='dialog'
      aria-expanded={isModalOpen}
      aria-controls={modalId}
      className={cn(
        'group transition-all duration-200 ease-in-out',
        collapsed
          ? 'h-9 w-9 rounded-full bg-surface-2 text-secondary-token hover:bg-surface-3 hover:text-primary-token'
          : 'w-full justify-start gap-2 rounded-lg px-3 text-sm font-medium text-secondary-token hover:bg-surface-2 hover:text-primary-token',
        'focus-visible:ring-offset-1',
        'motion-reduce:transform-none',
        !collapsed && 'active:scale-95 hover:scale-[1.02]'
      )}
    >
      {icon}
      {!collapsed && <span className='leading-none'>Feedback</span>}
    </Button>
  );

  // In collapsed mode, wrap with tooltip
  if (collapsed) {
    return (
      <>
        <Tooltip>
          <TooltipTrigger asChild>{buttonContent}</TooltipTrigger>
          <TooltipContent side='right' className='text-xs font-medium'>
            Send feedback
          </TooltipContent>
        </Tooltip>
        <FeedbackModal
          isOpen={isModalOpen}
          onClose={handleModalClose}
          id={modalId}
        />
      </>
    );
  }

  return (
    <>
      {buttonContent}
      <FeedbackModal
        isOpen={isModalOpen}
        onClose={handleModalClose}
        id={modalId}
      />
    </>
  );
}
