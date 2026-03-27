'use client';

import { Button } from '@jovie/ui';
import {
  ExternalLink,
  Send,
  ShieldCheck,
  Terminal,
  UserPlus,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { CampaignSettingsPanel } from '@/components/features/admin/campaigns/CampaignSettingsPanel';
import { WaitlistSettingsPanel } from '@/components/features/admin/WaitlistSettingsPanel';
import { SettingsActionRow } from '@/components/features/dashboard/molecules/SettingsActionRow';
import { SettingsPanel } from '@/components/features/dashboard/molecules/SettingsPanel';
import { APP_ROUTES } from '@/constants/routes';
import { SettingsToggleRow } from '@/features/dashboard/molecules/SettingsToggleRow';

const DEV_TOOLBAR_COOKIE = '__dev_toolbar';

function useDevToolbarCookie() {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    setEnabled(document.cookie.includes(`${DEV_TOOLBAR_COOKIE}=1`));
  }, []);

  const toggle = (checked: boolean) => {
    if (checked) {
      document.cookie = `${DEV_TOOLBAR_COOKIE}=1; path=/; max-age=31536000; SameSite=Lax`;
    } else {
      document.cookie = `${DEV_TOOLBAR_COOKIE}=; path=/; max-age=0; SameSite=Lax`;
    }
    setEnabled(checked);
    globalThis.location.reload();
  };

  return { enabled, toggle };
}

interface AdminLinkProps {
  readonly href: string;
  readonly icon: React.ElementType;
  readonly title: string;
  readonly description: string;
}

function AdminLink({ href, icon: Icon, title, description }: AdminLinkProps) {
  return (
    <SettingsActionRow
      icon={<Icon className='h-4 w-4' aria-hidden />}
      title={title}
      description={description}
      action={
        <Button variant='outline' size='sm' asChild>
          <Link href={href}>
            Open
            <ExternalLink className='ml-1.5 h-3.5 w-3.5' />
          </Link>
        </Button>
      }
    />
  );
}

/**
 * Admin settings section - only visible to admin users.
 *
 * Consolidates platform configuration (dev toolbar, waitlist controls,
 * campaign targeting/throttling) with quick links to admin dashboards.
 */
export function SettingsAdminSection() {
  const devToolbar = useDevToolbarCookie();

  return (
    <div className='space-y-6'>
      <SettingsPanel
        title='Developer tools'
        description='Controls for the on-screen dev toolbar.'
      >
        <div className='px-4 py-4 sm:px-5'>
          <SettingsToggleRow
            icon={<Terminal className='h-4 w-4' aria-hidden />}
            title='Dev toolbar'
            description='Show the toolbar with feature-flag overrides and environment details.'
            checked={devToolbar.enabled}
            onCheckedChange={devToolbar.toggle}
            ariaLabel='Toggle dev toolbar'
          />
        </div>
      </SettingsPanel>

      {/* Waitlist settings */}
      <WaitlistSettingsPanel />

      {/* Campaign targeting & throttling */}
      <CampaignSettingsPanel />

      <SettingsPanel
        title='Admin dashboards'
        description='Quick links to admin data views and operational tools.'
      >
        <div className='divide-y divide-subtle/60 px-4 sm:px-5'>
          <AdminLink
            href={APP_ROUTES.ADMIN_WAITLIST}
            icon={UserPlus}
            title='Waitlist'
            description='Review signups and approval queue.'
          />
          <AdminLink
            href={APP_ROUTES.ADMIN_CAMPAIGNS}
            icon={Send}
            title='Campaigns'
            description='Invite throughput, claim funnel, and send controls.'
          />
          <AdminLink
            href={APP_ROUTES.ADMIN_CREATORS}
            icon={Users}
            title='Creator Management'
            description='Verify, feature, and manage creator profiles.'
          />
          <AdminLink
            href={APP_ROUTES.ADMIN}
            icon={ShieldCheck}
            title='Admin Dashboard'
            description='Platform metrics, activity logs, and system health.'
          />
        </div>
      </SettingsPanel>
    </div>
  );
}
