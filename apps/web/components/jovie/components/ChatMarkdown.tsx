'use client';
// @coverage-via apps/web/components/jovie/components/SourceEvidence.test.tsx

import { memo, useEffect, useState } from 'react';
import { type Components, Streamdown } from 'streamdown';

import { getChatMarkdownStreamdownConfig } from '@/lib/markdown/streamdown-config';

interface SourceMarkdownMaps {
  readonly block: Components;
  readonly inline: Components;
}

let sourceMarkdownMaps: Promise<SourceMarkdownMaps> | null = null;

function loadSourceMarkdownMaps(): Promise<SourceMarkdownMaps> {
  // Static import would pull entity cards and Zod into shell and founder first-load JS.
  sourceMarkdownMaps ??= import('./SourceEvidence').then(module => ({
    block: module.SOURCE_MARKDOWN_COMPONENTS,
    inline: module.INLINE_SOURCE_MARKDOWN_COMPONENTS,
  }));
  return sourceMarkdownMaps;
}

interface ChatMarkdownProps {
  readonly content: string;
  readonly className?: string;
  readonly isStreaming?: boolean;
  /** Render a prose fragment without Streamdown's paragraph block wrapper. */
  readonly inline?: boolean;
}

/**
 * Renders chat markdown with streamdown's streaming-safe parser and sanitization.
 */
export const ChatMarkdown = memo(function ChatMarkdown({
  content,
  className,
  isStreaming = false,
  inline = false,
}: ChatMarkdownProps) {
  const [maps, setMaps] = useState<SourceMarkdownMaps | null>(null);
  useEffect(() => {
    let cancelled = false;
    void loadSourceMarkdownMaps().then(loaded => {
      if (!cancelled) setMaps(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  const components = maps ? (inline ? maps.inline : maps.block) : undefined;
  return (
    <div className='contents' data-source-markdown={maps ? 'ready' : 'pending'}>
      <Streamdown
        key={components ? 'source' : 'plain'}
        {...getChatMarkdownStreamdownConfig(isStreaming, className, inline)}
        {...(components ? { components } : {})}
      >
        {content}
      </Streamdown>
    </div>
  );
});
