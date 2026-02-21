import type { StreamdownProps } from 'streamdown';

import { cn } from '@/lib/utils';

const SAFE_PROTOCOL_PATTERN = /^(https?:|mailto:|tel:|\/|#)/i;

const CHAT_MARKDOWN_STYLES = cn(
  'text-[15px] leading-7 tracking-[-0.01em] text-primary-token antialiased',
  '[&_p]:mb-3 [&_p:last-child]:mb-0',
  '[&_ul]:my-3 [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5',
  '[&_ol]:my-3 [&_ol]:list-decimal [&_ol]:space-y-1.5 [&_ol]:pl-5',
  '[&_li]:text-[15px] [&_li]:leading-7',
  '[&_strong]:font-semibold [&_strong]:text-primary-token',
  '[&_del]:text-tertiary-token',
  '[&_em]:italic',
  '[&_h1]:mt-5 [&_h1]:mb-2 [&_h1]:text-xl [&_h1]:font-semibold [&_h1]:leading-tight [&_h1]:tracking-[-0.02em] [&_h1]:text-primary-token',
  '[&_h2]:mt-4 [&_h2]:mb-2 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:leading-tight [&_h2]:tracking-[-0.02em] [&_h2]:text-primary-token',
  '[&_h3]:mt-4 [&_h3]:mb-1 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:leading-snug [&_h3]:text-primary-token',
  '[&_h4]:mt-3 [&_h4]:mb-1 [&_h4]:text-sm [&_h4]:font-semibold [&_h4]:text-primary-token',
  '[&_code]:rounded-md [&_code]:bg-surface-3/80 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[13px]',
  '[&_pre]:my-4 [&_pre]:overflow-x-auto [&_pre]:rounded-xl [&_pre]:border [&_pre]:border-subtle [&_pre]:bg-surface-2 [&_pre]:p-4',
  '[&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-[13px] [&_pre_code]:leading-6',
  '[&_a]:font-medium [&_a]:text-accent [&_a]:underline [&_a]:decoration-accent/50 [&_a]:underline-offset-4 hover:[&_a]:decoration-accent',
  '[&_hr]:my-5 [&_hr]:border-subtle',
  '[&_blockquote]:my-4 [&_blockquote]:border-l-2 [&_blockquote]:border-accent/30 [&_blockquote]:pl-4 [&_blockquote]:text-secondary-token [&_blockquote]:italic'
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
    'del',
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
