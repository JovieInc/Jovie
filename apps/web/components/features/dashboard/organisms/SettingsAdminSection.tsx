'use client';

import { Button } from '@jovie/ui';
import * as Switch from '@radix-ui/react-switch';
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
import { ContentSectionHeader } from '@/components/molecules/ContentSectionHeader';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { APP_ROUTES } from '@/constants/routes';
import { DashboardCard } from '@/features/dashboard/atoms/DashboardCard';

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
    <ContentSurfaceCard className='flex items-center justify-between gap-3 bg-surface-0 p-4'>
      <div className='flex min-w-0 items-center gap-3'>
        <Icon className='h-4 w-4 shrink-0 text-secondary-token' aria-hidden />
        <div>
          <p className='text-[13px] font-[510] text-primary-token'>{title}</p>
          <p className='mt-0.5 text-[13px] text-secondary-token'>
            {description}
          </p>
        </div>
      </div>
      <Button variant='outline' size='sm' asChild>
        <Link href={href}>
          Open
          <ExternalLink className='h-3.5 w-3.5 ml-1.5' />
        </Link>
      </Button>
    </ContentSurfaceCard>
  );
}

/**
 * Admin settings section - only visible to admin users.
 *
 * Provides quick links to admin pages for waitlist management,
 * campaign targeting, creator management, and system activity.
 */
export function SettingsAdminSection() {
  const devToolbar = useDevToolbarCookie();

  return (
    <DashboardCard
      variant='settings'
      padding='none'
      className='overflow-hidden'
    >
      <ContentSectionHeader
        title='Admin tools'
        subtitle='Platform-only controls for queue management, campaigns, and system operations.'
        className='min-h-0 px-4 py-3'
      />
      <div className='space-y-3 px-4 py-3'>
        <ContentSurfaceCard className='flex items-center gap-3 bg-surface-0 px-4 py-3.5'>
          <ShieldCheck
            className='h-4 w-4 shrink-0 text-secondary-token'
            aria-hidden
          />
          <p className='text-[13px] leading-[18px] text-secondary-token'>
            These controls are only visible to admin accounts. Use them to
            manage platform operations without leaving the authenticated shell.
          </p>
        </ContentSurfaceCard>

        <ContentSurfaceCard className='flex items-center justify-between gap-3 bg-surface-0 p-4'>
          <div className='flex min-w-0 items-center gap-3'>
            <Terminal
              className='h-4 w-4 shrink-0 text-secondary-token'
              aria-hidden
            />
            <div>
              <p className='text-[13px] font-[510] text-primary-token'>
                Dev Toolbar
              </p>
              <p className='mt-0.5 text-[13px] text-secondary-token'>
                Show the dev toolbar with feature flag overrides and environment
                info.
              </p>
            </div>
          </div>
          <Switch.Root
            checked={devToolbar.enabled}
            onCheckedChange={devToolbar.toggle}
            className={`relative w-9 h-5 rounded-full transition-colors outline-none cursor-pointer shrink-0 ${
              devToolbar.enabled
                ? 'bg-[var(--color-accent)]'
                : 'bg-[var(--color-bg-surface-3,#333)]'
            }`}
          >
            <Switch.Thumb className='block w-4 h-4 bg-white rounded-full transition-transform translate-x-0.5 data-[state=checked]:translate-x-[18px] shadow-sm' />
          </Switch.Root>
        </ContentSurfaceCard>

        <div className='space-y-2'>
          <AdminLink
            href={APP_ROUTES.ADMIN_WAITLIST}
            icon={UserPlus}
            title='Waitlist'
            description='Review signups, auto-accept settings, and approval queue.'
          />
          <AdminLink
            href={APP_ROUTES.ADMIN_CAMPAIGNS}
            icon={Send}
            title='Campaigns'
            description='Manage creator claim campaigns with throttling and anti-spam controls.'
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
      </div>
    </DashboardCard>
  );
}
