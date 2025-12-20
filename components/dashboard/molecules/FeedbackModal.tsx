'use client';

import { track } from '@/lib/analytics';
import { DashboardFeedbackModal as DashboardFeedbackModalOrganism } from '@/components/dashboard/organisms/DashboardFeedbackModal';

interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * @deprecated This component is a wrapper that adds business logic (analytics tracking).
 * For new code, use DashboardFeedbackModal from organisms directly and handle tracking in the parent component.
 * This wrapper exists for backward compatibility.
 */
export function FeedbackModal({ isOpen, onClose }: FeedbackModalProps) {
  const handleSubmit = async (feedback: string) => {
    track('feedback_submitted', {
      feedback: feedback.trim(),
      source: 'dashboard_sidebar',
      method: 'custom_modal',
      character_count: feedback.trim().length,
    });
  };

  return (
    <DashboardFeedbackModalOrganism
      isOpen={isOpen}
      onClose={onClose}
      onSubmit={handleSubmit}
    />
  );
}
