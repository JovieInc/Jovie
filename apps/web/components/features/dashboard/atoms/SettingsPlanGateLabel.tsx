'use client';

import { Tooltip, TooltipContent, TooltipTrigger } from '@jovie/ui';
import { Lock } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { APP_ROUTES } from '@/constants/routes';
import { track } from '@/lib/analytics';

interface SettingsPlanGateLabelProps {
  readonly planName?: string;
  /** Feature name for contextual copy and tracking (e.g., "contact export", "ad pixels") */
  readonly featureContext?: string;
}

export function SettingsPlanGateLabel({
  planName = 'Pro',
  featureContext,
}: SettingsPlanGateLabelProps) {
  const hasTrackedRef = useRef(false);

  useEffect(() => {
    if (!hasTrackedRef.current && featureContext) {
      track('upgrade_nudge_shown', {
        feature: featureContext,
        plan_required: planName,
      });
      hasTrackedRef.current = true;
    }
  }, [featureContext, planName]);

  const handleUpgradeClick = () => {
    track('upgrade_nudge_clicked', {
      feature: featureContext ?? 'unknown',
      plan_required: planName,
    });
  };

  const tooltipLabel = featureContext
    ? `${featureContext} is available on ${planName}`
    : `Available on ${planName}`;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className='inline-flex items-center gap-1 text-[13px] text-tertiary-token'>
          <Lock className='h-3.5 w-3.5' aria-hidden='true' />
          {planName}
        </span>
      </TooltipTrigger>
      <TooltipContent side='top' className='flex items-center gap-1.5'>
        <span>{tooltipLabel}</span>
        <span aria-hidden='true'>·</span>
        <Link
          href={APP_ROUTES.PRICING}
          className='font-[510] text-accent-token underline underline-offset-2'
          onClick={handleUpgradeClick}
        >
          Upgrade
        </Link>
      </TooltipContent>
    </Tooltip>
  );
}
