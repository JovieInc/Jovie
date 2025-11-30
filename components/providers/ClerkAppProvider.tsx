'use client';

import { ClerkProvider } from '@clerk/nextjs';
import React, { type ComponentProps } from 'react';
import { publicEnv } from '@/lib/env-public';
import { logger } from '@/lib/utils/logger';

export interface ClerkAppProviderProps {
  children: React.ReactNode;
}

export function ClerkAppProvider({ children }: ClerkAppProviderProps) {
  const publishableKey = publicEnv.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

  if (!publishableKey) {
    if (
      process.env.NODE_ENV === 'test' ||
      process.env.NODE_ENV === 'development'
    ) {
      logger.debug('Bypassing Clerk authentication (no keys provided)');
      return <>{children}</>;
    }

    return (
      <div className='flex items-center justify-center min-h-screen'>
        <div className='text-center'>
          <h1 className='text-2xl font-bold text-red-600 mb-4'>
            Configuration Error
          </h1>
          <p className='text-gray-600'>
            Clerk publishable key is not configured.
          </p>
        </div>
      </div>
    );
  }

  return (
    <ClerkProvider
      clerkJSVersion='latest'
      publishableKey={publishableKey}
      appearance={
        {
          elements: {
            rootBox: 'bg-base text-primary',
            card: 'bg-surface-1 border border-subtle dark:border-default',
            headerTitle: 'text-primary',
            headerSubtitle: 'text-secondary',
            formFieldInput:
              'bg-surface-0 border border-default focus-ring-themed',
            formButtonPrimary: 'btn btn-primary btn-md',
            socialButtonsBlockButton: 'btn btn-secondary btn-md',
            footerActionText: 'text-secondary',
            footerActionLink: 'text-accent-token',
          },
        } as ComponentProps<typeof ClerkProvider>['appearance']
      }
    >
      {children}
    </ClerkProvider>
  );
}
