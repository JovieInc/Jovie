import type { StreamdownProps } from 'streamdown';

import { cn } from '@/lib/utils';

const SAFE_PROTOCOL_PATTERN = /^(https?:|mailto:|tel:|\/|#)/i;

const CHAT_MARKDOWN_STYLES = 'system-b-chat-markdown text-primary-token';

const urlTransform: NonNullable<StreamdownProps['urlTransform']> = url => {
  if (!url || !SAFE_PROTOCOL_PATTERN.test(url)) {
    return '';
  }

  return url;
};

const baseStreamdownConfig: Omit<
  StreamdownProps,
  'children' | 'mode' | 'isAnimating' | 'className'
> = {
  skipHtml: true,
  urlTransform,
  allowedElements: [
    'a',
    'blockquote',
    'br',
    'code',
    'em',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'hr',
    'img',
    'li',
    'ol',
    'p',
    'pre',
    'strong',
    'del',
    'table',
    'tbody',
    'td',
    'th',
    'thead',
    'tr',
    'ul',
  ],
  allowedTags: {
    a: ['href', 'title'],
    img: ['src', 'alt', 'title'],
    th: ['scope'],
  },
  caret: 'block',
};

/** Frozen config objects so Streamdown can bail out when only content changes. */
export const CHAT_MARKDOWN_STREAMING_CONFIG: StreamdownProps = {
  ...baseStreamdownConfig,
  className: CHAT_MARKDOWN_STYLES,
  mode: 'streaming',
  isAnimating: true,
};

export const CHAT_MARKDOWN_STATIC_CONFIG: StreamdownProps = {
  ...baseStreamdownConfig,
  className: CHAT_MARKDOWN_STYLES,
  mode: 'static',
  isAnimating: false,
};

export function getChatMarkdownStreamdownConfig(
  isStreaming: boolean,
  className?: string
): StreamdownProps {
  const baseConfig = isStreaming
    ? CHAT_MARKDOWN_STREAMING_CONFIG
    : CHAT_MARKDOWN_STATIC_CONFIG;

  if (!className) {
    return baseConfig;
  }

  return {
    ...baseConfig,
    className: cn(CHAT_MARKDOWN_STYLES, className),
  };
}

export { CHAT_MARKDOWN_STYLES };
