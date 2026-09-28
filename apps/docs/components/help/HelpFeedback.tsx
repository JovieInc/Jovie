'use client';

import { useState } from 'react';

export const HELP_FEEDBACK_EVENT = 'jovie:help-feedback';

type HelpFeedbackProps = {
  /** The current article's frontmatter `id`, attached to feedback events. */
  articleId: string;
};

/**
 * Instrumentable "Was this helpful?" affordance. Dispatches a
 * `jovie:help-feedback` CustomEvent on window so any analytics binding can
 * subscribe without coupling to a specific transport.
 */
export function HelpFeedback({ articleId }: HelpFeedbackProps) {
  const [choice, setChoice] = useState<'yes' | 'no' | null>(null);

  const submit = (value: 'yes' | 'no') => {
    setChoice(value);
    window.dispatchEvent(
      new CustomEvent(HELP_FEEDBACK_EVENT, {
        detail: { articleId, value },
      })
    );
  };

  return (
    <section
      className='help-section help-feedback'
      aria-labelledby='was-this-helpful'
      data-help-feedback=''
      data-article-id={articleId}
    >
      <h2 id='was-this-helpful'>Was this helpful?</h2>
      {choice ? (
        <p role='status'>Thanks for the feedback.</p>
      ) : (
        <div className='help-feedback-actions'>
          <button
            type='button'
            className='help-feedback-button'
            onClick={() => submit('yes')}
          >
            Yes
          </button>
          <button
            type='button'
            className='help-feedback-button'
            onClick={() => submit('no')}
          >
            No
          </button>
        </div>
      )}
    </section>
  );
}
