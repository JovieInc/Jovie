'use client';

import { Button } from '@jovie/ui';
import { Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback } from 'react';
import { NEW_RELEASE_PROMPT } from '@/components/jovie/types';
import { APP_ROUTES } from '@/constants/routes';

export function NewReleaseChatButton() {
  const router = useRouter();

  const handleClick = useCallback(() => {
    const encoded = encodeURIComponent(NEW_RELEASE_PROMPT);
    router.push(`${APP_ROUTES.CHAT}?q=${encoded}`);
  }, [router]);

  return (
    <Button
      variant='ghost'
      size='icon'
      onClick={handleClick}
      aria-label='Add new release'
      className='h-8 w-8 border-none'
    >
      <Plus className='h-4 w-4' />
    </Button>
  );
}
