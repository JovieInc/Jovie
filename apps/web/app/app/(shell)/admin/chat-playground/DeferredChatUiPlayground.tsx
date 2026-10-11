'use client';

import dynamic from 'next/dynamic';

const ChatUiPlayground = dynamic(
  () => import('./ChatUiPlayground').then(module => module.ChatUiPlayground),
  {
    ssr: false,
    loading: () => (
      <p role='status' className='text-sm text-secondary-token'>
        Loading chat scenarios…
      </p>
    ),
  }
);

export function DeferredChatUiPlayground() {
  return <ChatUiPlayground />;
}
