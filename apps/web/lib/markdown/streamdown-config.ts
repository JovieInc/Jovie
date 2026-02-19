import type { StreamdownProps } from 'streamdown';

import { cn } from '@/lib/utils';

const SAFE_PROTOCOL_PATTERN = /^(https?:|mailto:|tel:|\/|#)/i;

const CHAT_MARKDOWN_STYLES = cn(
  'text-sm leading-relaxed text-secondary-token',
  '[&_p]:mb-2 [&_p:last-child]:mb-0',
  '[&_ul]:my-2 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-4',
  '[&_ol]:my-2 [&_ol]:list-decimal [&_ol]:space-y-1 [&_ol]:pl-4',
  '[&_li]:text-sm [&_li]:leading-relaxed',
  '[&_strong]:font-semibold [&_strong]:text-primary-token',
  '[&_em]:italic',
  '[&_h1]:mt-3 [&_h1]:mb-1 [&_h1]:text-base [&_h1]:font-semibold [&_h1]:text-primary-token',
  '[&_h2]:mt-3 [&_h2]:mb-1 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-primary-token',
  '[&_h3]:mt-3 [&_h3]:mb-1 [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:text-primary-token',
  '[&_h4]:mt-2 [&_h4]:mb-1 [&_h4]:text-sm [&_h4]:font-medium [&_h4]:text-primary-token',
  '[&_code]:rounded-md [&_code]:bg-surface-3 [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-xs',
  '[&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-surface-3 [&_pre]:p-3',
  '[&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-xs',
  '[&_a]:text-accent [&_a]:underline [&_a]:underline-offset-2',
  '[&_hr]:my-3 [&_hr]:border-subtle',
  '[&_blockquote]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:border-subtle [&_blockquote]:pl-3 [&_blockquote]:text-secondary-token'
);

const urlTransform: NonNullable<StreamdownProps['urlTransform']> = url => {
  if (!url || !SAFE_PROTOCOL_PATTERN.test(url)) {
    return '';
  }

  return url;
};

const baseStreamdownConfig: Omit<
  StreamdownProps,
  'children' | 'mode' | 'isAnimating'
> = {
  className: CHAT_MARKDOWN_STYLES,
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
    'hr',
    'li',
    'ol',
    'p',
    'pre',
    'strong',
    'ul',
  ],
  allowedTags: {
    a: ['href', 'title'],
  },
  caret: 'block',
};

export function getChatMarkdownStreamdownConfig(
  isStreaming: boolean,
  className?: string
): StreamdownProps {
  return {
    ...baseStreamdownConfig,
    className: cn(CHAT_MARKDOWN_STYLES, className),
    mode: isStreaming ? 'streaming' : 'static',
    isAnimating: isStreaming,
  };
}

export { CHAT_MARKDOWN_STYLES };
