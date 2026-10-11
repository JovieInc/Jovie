'use client';

import { useEffect, useState } from 'react';

const SUPPORT_EMAIL = 'support@jov.ie';

function safeValue(value: string | null): string {
  if (!value) return '';
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 500) return '';
  return trimmed;
}

export function ContactSupport({
  from,
  query,
}: {
  from?: string;
  query?: string;
}) {
  const [referrer, setReferrer] = useState('');
  const [pageUrl, setPageUrl] = useState('');
  const [userAgent, setUserAgent] = useState('');

  useEffect(() => {
    setPageUrl(window.location.href);
    setUserAgent(window.navigator.userAgent);
    if (document.referrer) {
      try {
        const url = new URL(document.referrer);
        if (url.protocol === 'https:' || url.protocol === 'http:') {
          setReferrer(document.referrer);
        }
      } catch {
        // Ignore malformed referrers; the field is optional context.
      }
    }
  }, []);

  const articleContext = safeValue(from ?? null) || referrer;
  const searchContext = safeValue(query ?? null);

  const bodyLines = [
    'Describe the problem:',
    '',
    '',
    '---',
    'Context (automatically included):',
    `Article or referring page: ${articleContext || 'not provided'}`,
    `Search query: ${searchContext || 'not provided'}`,
    `Contact page URL: ${pageUrl}`,
    `Timestamp: ${new Date().toISOString()}`,
    `Environment: docs.jov.ie help center`,
    `User agent: ${userAgent}`,
  ];

  const mailto = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(
    'Jovie support request'
  )}&body=${encodeURIComponent(bodyLines.join('\n'))}`;

  return (
    <div>
      <p>
        Tell us what went wrong. The email draft below already includes the
        page, referrer, and search context so you do not have to re-explain
        where you got stuck. No account data, credentials, or private state is
        included.
      </p>
      <dl>
        <dt>Article or referring page</dt>
        <dd>{articleContext || 'not provided'}</dd>
        <dt>Search query</dt>
        <dd>{searchContext || 'not provided'}</dd>
      </dl>
      <p>
        <a href={mailto}>Email support with this context</a>
      </p>
      <p>
        Prefer your own mail client? Email{' '}
        <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> directly.
      </p>
    </div>
  );
}
