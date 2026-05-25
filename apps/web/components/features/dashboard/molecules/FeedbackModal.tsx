'use client';

import { DashboardFeedbackModal as DashboardFeedbackModalOrganism } from '@/features/dashboard/organisms/DashboardFeedbackModal';
import { track } from '@/lib/analytics';
import { useFeedbackMutation } from '@/lib/queries';

interface FeedbackModalProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
}

/**
 * @deprecated This component is a wrapper that adds business logic (analytics tracking).
 * For new code, use DashboardFeedbackModal from organisms directly and handle tracking in the parent component.
 * This wrapper exists for backward compatibility.
 */
export function FeedbackModal({ isOpen, onClose }: FeedbackModalProps) {
  const { mutateAsync: submitFeedback } = useFeedbackMutation();

  const handleSubmit = async (feedback: string) => {
    const trimmedFeedback = feedback.trim();
    await submitFeedback({
      message: trimmedFeedback,
      source: 'dashboard_sidebar',
      pathname:
        globalThis.window === undefined ? null : globalThis.location.pathname,
    });

    track('feedback_submitted', {
      feedback: trimmedFeedback,
      source: 'dashboard_sidebar',
      method: 'custom_modal',
      character_count: trimmedFeedback.length,
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
