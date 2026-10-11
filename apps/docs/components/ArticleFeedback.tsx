'use client';

import { usePathname } from 'next/navigation';
import { useState } from 'react';
import {
  articleIdFromPathname,
  HELP_FEEDBACK_REASONS,
  trackHelpCenterEvent,
} from '@/lib/help-analytics.mjs';
import './help-feedback.css';

const REASON_LABELS: Record<(typeof HELP_FEEDBACK_REASONS)[number], string> = {
  outdated: 'Outdated',
  missing_info: 'Missing info',
  did_not_answer: "Didn't answer my question",
  confusing: 'Confusing',
};

const SUPPORT_URL = 'https://jov.ie/support';

/**
 * Compact "Was this helpful?" widget rendered after article content.
 * Feedback is fire-and-forget: transport failures never block reading and
 * never surface an error state to the reader.
 */
export function ArticleFeedback() {
  const pathname = usePathname();
  const articleId = articleIdFromPathname(pathname);
  const [value, setValue] = useState<'helpful' | 'not_helpful' | null>(null);
  const [reason, setReason] = useState<string | null>(null);

  if (!articleId) return null;

  const submit = (feedback: 'helpful' | 'not_helpful', selected?: string) => {
    void trackHelpCenterEvent('article_feedback', {
      article_id: articleId,
      feedback,
      feedback_reason: selected,
      source_surface: 'article',
    });
  };

  const onSelect = (feedback: 'helpful' | 'not_helpful') => {
    setValue(feedback);
    submit(feedback);
  };

  const onReason = (selected: string) => {
    if (reason) return;
    setReason(selected);
    submit('not_helpful', selected);
  };

  const onSupport = () => {
    void trackHelpCenterEvent('contact_support_opened', {
      article_id: articleId,
      source_surface: 'article',
    });
    void trackHelpCenterEvent('support_escalation', {
      article_id: articleId,
      source_surface: 'article',
      feedback_reason: reason ?? undefined,
    });
  };

  return (
    <section className='help-feedback' aria-label='Article feedback'>
      {value === null ? (
        <>
          <span className='help-feedback-prompt'>Was this helpful?</span>
          <button type='button' onClick={() => onSelect('helpful')}>
            Yes
          </button>
          <button type='button' onClick={() => onSelect('not_helpful')}>
            No
          </button>
        </>
      ) : (
        <>
          <span className='help-feedback-prompt'>
            {value === 'helpful'
              ? 'Thanks for the feedback.'
              : 'Thanks — what went wrong?'}
          </span>
          {value === 'not_helpful' && !reason && (
            <span className='help-feedback-reasons'>
              {HELP_FEEDBACK_REASONS.map(option => (
                <button
                  key={option}
                  type='button'
                  onClick={() => onReason(option)}
                >
                  {REASON_LABELS[option]}
                </button>
              ))}
            </span>
          )}
          {value === 'not_helpful' && (
            <a
              href={`${SUPPORT_URL}?source=help-article-feedback&article=${articleId}`}
              onClick={onSupport}
            >
              Contact support
            </a>
          )}
        </>
      )}
    </section>
  );
}
