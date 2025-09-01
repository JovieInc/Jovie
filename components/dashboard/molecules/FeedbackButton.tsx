'use client';

import { ChatBubbleBottomCenterTextIcon } from '@heroicons/react/24/outline';
import { DashboardButton } from '@/components/dashboard/atoms/DashboardButton';
import { track } from '@/lib/analytics';
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
    track('feedback_button_clicked', {
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
    <DashboardButton
      variant='nav-item'
      onClick={handleFeedbackClick}
      className={cn(
        collapsed ? 'justify-center h-8 w-8 p-0' : 'w-full',
        'items-center'
      )}
      aria-label={collapsed ? 'Send feedback' : undefined}
    >
      <div className='flex items-center gap-x-3'>
        <ChatBubbleBottomCenterTextIcon className='h-4 w-4 shrink-0 text-emerald-500 group-hover:text-emerald-400 transition-colors duration-200' />
        {!collapsed && (
          <span className='text-sm leading-6 font-semibold'>Feedback</span>
        )}
      </div>
    </DashboardButton>
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
