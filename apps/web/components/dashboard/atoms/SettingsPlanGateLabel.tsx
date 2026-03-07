'use client';

import { Tooltip, TooltipContent, TooltipTrigger } from '@jovie/ui';
import { Lock } from 'lucide-react';
import Link from 'next/link';
import { APP_ROUTES } from '@/constants/routes';

interface SettingsPlanGateLabelProps {
  readonly planName?: string;
}

export function SettingsPlanGateLabel({
  planName = 'Pro',
}: SettingsPlanGateLabelProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className='inline-flex items-center gap-1 text-sm text-tertiary-token'>
          <Lock className='h-3.5 w-3.5' aria-hidden='true' />
          {planName}
        </span>
      </TooltipTrigger>
      <TooltipContent side='top' className='flex items-center gap-1.5'>
        <span>Available on {planName}</span>
        <span aria-hidden='true'>·</span>
        <Link
          href={APP_ROUTES.PRICING}
          className='font-medium text-accent-token underline underline-offset-2'
        >
          Upgrade
        </Link>
      </TooltipContent>
    </Tooltip>
  );
}
