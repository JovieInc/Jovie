'use client';

import DOMPurify from 'isomorphic-dompurify';
import { useEffect, useState } from 'react';

interface LegalContentProps {
  endpoint: string;
  fallbackHtml: string;
}

export function LegalContent({ endpoint, fallbackHtml }: LegalContentProps) {
  const [contentHtml, setContentHtml] = useState('');

  useEffect(() => {
    fetch(endpoint)
      .then(res => res.text())
      .then(html => {
        // Sanitize HTML to prevent XSS attacks
        const sanitized = DOMPurify.sanitize(html, {
          ALLOWED_TAGS: [
            'h1',
            'h2',
            'h3',
            'h4',
            'h5',
            'h6',
            'p',
            'a',
            'ul',
            'ol',
            'li',
            'strong',
            'em',
            'code',
            'pre',
            'blockquote',
          ],
          ALLOWED_ATTR: ['href', 'target', 'rel'],
          ALLOW_DATA_ATTR: false,
        });
        setContentHtml(sanitized);
      })
      .catch(err => {
        console.error(`Failed to load ${endpoint}:`, err);
        // Sanitize fallback HTML as well
        const sanitized = DOMPurify.sanitize(fallbackHtml, {
          ALLOWED_TAGS: ['p'],
          ALLOWED_ATTR: [],
        });
        setContentHtml(sanitized);
      });
  }, [endpoint, fallbackHtml]);

  return (
    <div
      className='prose prose-invert max-w-none prose-headings:text-white prose-p:text-white/70 prose-a:text-blue-400 prose-strong:text-white prose-code:text-white prose-pre:bg-white/5 prose-pre:border prose-pre:border-white/10'
      dangerouslySetInnerHTML={{ __html: contentHtml }}
    />
  );
}
