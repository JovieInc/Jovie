'use client';

import { Button } from '@jovie/ui';
import { ExternalLink, Send, ShieldCheck, UserPlus, Users } from 'lucide-react';
import Link from 'next/link';
import { DashboardCard } from '@/components/dashboard/atoms/DashboardCard';
import { APP_ROUTES } from '@/constants/routes';

interface AdminLinkProps {
  readonly href: string;
  readonly icon: React.ElementType;
  readonly title: string;
  readonly description: string;
}

function AdminLink({ href, icon: Icon, title, description }: AdminLinkProps) {
  return (
    <div className='flex items-center justify-between px-4 py-3'>
      <div className='flex items-center gap-3'>
        <Icon className='h-4 w-4 shrink-0 text-secondary-token' />
        <div>
          <p className='text-sm font-medium text-primary-token'>{title}</p>
          <p className='text-xs text-secondary-token mt-0.5'>{description}</p>
        </div>
      </div>
      <Button variant='outline' size='sm' asChild>
        <Link href={href}>
          Open
          <ExternalLink className='h-3.5 w-3.5 ml-1.5' />
        </Link>
      </Button>
    </div>
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
      className='divide-y divide-subtle'
    >
      <div className='px-4 py-3'>
        <div className='flex items-center gap-2'>
          <ShieldCheck className='h-4 w-4 text-secondary-token' />
          <p className='text-xs text-secondary-token'>
            These settings are only visible to admin accounts. Manage platform
            operations from the dedicated admin pages.
          </p>
        </div>
      </div>
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
    </DashboardCard>
  );
}
