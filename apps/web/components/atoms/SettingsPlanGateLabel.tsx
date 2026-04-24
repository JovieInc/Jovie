'use client';

import { Tooltip, TooltipContent, TooltipTrigger } from '@jovie/ui';
import { Lock } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { APP_ROUTES } from '@/constants/routes';
import { track } from '@/lib/analytics';

interface SettingsPlanGateLabelProps {
  readonly planName?: string;
  readonly featureContext?: string;
}

export function SettingsPlanGateLabel({
  planName = 'Pro',
  featureContext,
}: Readonly<SettingsPlanGateLabelProps>) {
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
        <Link
          href={APP_ROUTES.PRICING}
          aria-label={`Upgrade to ${planName}`}
          className='inline-flex items-center gap-1 rounded-sm text-app text-tertiary-token underline underline-offset-2 transition-colors hover:text-secondary-token focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/20'
          onClick={handleUpgradeClick}
        >
          <Lock className='h-3.5 w-3.5' aria-hidden='true' />
          {planName}
        </Link>
      </TooltipTrigger>
      <TooltipContent side='top'>
        <span>{tooltipLabel}</span>
      </TooltipContent>
    </Tooltip>
  );
}
