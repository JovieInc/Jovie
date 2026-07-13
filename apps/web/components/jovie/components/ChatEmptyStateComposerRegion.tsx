'use client';

import type { ReactNode } from 'react';
import { BrandLogo } from '@/components/atoms/BrandLogo';

import { CHAT_CONTENT_SHELL_CLASSNAME } from '../chat-layout';

const AMBIENT_LOGO_OPACITY = 0.18;

export function ChatEmptyStateComposerRegion({
  above,
  children,
  greetingName,
}: {
  readonly above?: ReactNode;
  readonly children: ReactNode;
  readonly greetingName?: string | null;
}) {
  const trimmedName = greetingName?.trim();
  const greeting = trimmedName ? `Hi, ${trimmedName}` : 'Hi there';
  const showWelcomeHeader = !above;

  return (
    <div
      className={`${CHAT_CONTENT_SHELL_CLASSNAME} chat-stagger relative flex min-h-full flex-col items-center justify-center px-1 py-8`}
      data-testid='chat-empty-state-composer-region'
    >
      {above ? (
        <div className='absolute inset-x-0 bottom-1/2 z-10 mb-12 max-h-[min(46vh,24rem)] overflow-y-auto overscroll-contain px-1 pb-1'>
          {above}
        </div>
      ) : null}
      {showWelcomeHeader ? (
        <div
          aria-hidden='true'
          className='relative z-10 mb-4'
          style={{ opacity: AMBIENT_LOGO_OPACITY }}
          data-testid='chat-empty-state-logo'
        >
          <BrandLogo
            size={56}
            className='text-primary-token'
            aria-hidden={true}
          />
        </div>
      ) : null}
      {showWelcomeHeader ? (
        <h2
          className='relative z-10 mb-6 text-2xl font-semibold text-primary-token'
          data-testid='chat-empty-state-greeting'
        >
          {greeting}
        </h2>
      ) : null}
      <div
        className='relative z-10 w-full'
        data-testid='chat-empty-state-centered-composer'
      >
        {children}
      </div>
    </div>
  );
}
