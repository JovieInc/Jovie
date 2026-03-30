'use client';

import dynamic from 'next/dynamic';
import ChatLoading from './loading';

export const DeferredChatPageClient = dynamic(
  () => import('./ChatPageClient').then(mod => mod.ChatPageClient),
  {
    loading: () => <ChatLoading />,
    ssr: false,
  }
);
