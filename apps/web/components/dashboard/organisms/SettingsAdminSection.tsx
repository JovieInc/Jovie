'use client';

import { Button } from '@jovie/ui';
import { ExternalLink, Send, ShieldCheck, UserPlus, Users } from 'lucide-react';
import Link from 'next/link';
import { DashboardCard } from '@/components/dashboard/atoms/DashboardCard';
import { ContentSectionHeader } from '@/components/molecules/ContentSectionHeader';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { APP_ROUTES } from '@/constants/routes';

interface AdminLinkProps {
  readonly href: string;
  readonly icon: React.ElementType;
  readonly title: string;
  readonly description: string;
}

function AdminLink({ href, icon: Icon, title, description }: AdminLinkProps) {
  return (
    <ContentSurfaceCard className='flex items-center justify-between gap-3 bg-(--linear-bg-surface-0) p-4'>
      <div className='flex min-w-0 items-center gap-3'>
        <Icon className='h-4 w-4 shrink-0 text-secondary-token' aria-hidden />
        <div>
          <p className='text-[13px] font-[510] text-primary-token'>{title}</p>
          <p className='text-[13px] text-secondary-token mt-0.5'>
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
        <ContentSurfaceCard className='flex items-center gap-3 bg-(--linear-bg-surface-0) px-4 py-3.5'>
          <ShieldCheck
            className='h-4 w-4 shrink-0 text-secondary-token'
            aria-hidden
          />
          <p className='text-[13px] leading-[18px] text-secondary-token'>
            These controls are only visible to admin accounts. Use them to
            manage platform operations without leaving the authenticated shell.
          </p>
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
