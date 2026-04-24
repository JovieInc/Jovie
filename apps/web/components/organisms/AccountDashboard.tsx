'use client';

import { Button } from '@jovie/ui';
import { CreditCard, Settings, User } from 'lucide-react';
import Link from 'next/link';
import { ContentSectionHeader } from '@/components/molecules/ContentSectionHeader';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { DOCS_URL } from '@/constants/domains';
import { APP_ROUTES } from '@/constants/routes';

export function AccountDashboard() {
  return (
    <div className='space-y-6'>
      {/* Header */}
      <div>
        <h1 className='text-[24px] font-[620] tracking-[-0.03em] text-primary-token'>
          Account Settings
        </h1>
        <p className='mt-2 text-app text-secondary-token'>
          Manage your account preferences and settings
        </p>
      </div>

      {/* Quick Actions */}
      <div className='grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3'>
        {/* Billing & Subscription */}
        <ContentSurfaceCard className='p-5'>
          <div className='flex items-center'>
            <div className='shrink-0'>
              <CreditCard className='h-7 w-7 text-[var(--accent-analytics)]' />
            </div>
            <div className='ml-4'>
              <h3 className='text-[15px] font-semibold text-primary-token'>
                Billing & Subscription
              </h3>
              <p className='text-app text-secondary-token'>
                Manage your subscription and payment methods
              </p>
            </div>
          </div>
          <div className='mt-4'>
            <Button variant='outline' size='sm' asChild>
              <Link href={APP_ROUTES.SETTINGS_BILLING}>Manage Billing</Link>
            </Button>
          </div>
        </ContentSurfaceCard>

        {/* Profile Settings */}
        <ContentSurfaceCard className='p-5'>
          <div className='flex items-center'>
            <div className='shrink-0'>
              <User className='h-7 w-7 text-[var(--accent-speed)]' />
            </div>
            <div className='ml-4'>
              <h3 className='text-[15px] font-semibold text-primary-token'>
                Creator Profile
              </h3>
              <p className='text-app text-secondary-token'>
                Update your public profile and links
              </p>
            </div>
          </div>
          <div className='mt-4'>
            <Button variant='outline' size='sm' asChild>
              <Link href={APP_ROUTES.SETTINGS_ARTIST_PROFILE}>
                Edit Profile
              </Link>
            </Button>
          </div>
        </ContentSurfaceCard>

        {/* General Settings */}
        <ContentSurfaceCard className='p-5'>
          <div className='flex items-center'>
            <div className='shrink-0'>
              <Settings className='h-7 w-7 text-[var(--accent-conv)]' />
            </div>
            <div className='ml-4'>
              <h3 className='text-[15px] font-semibold text-primary-token'>
                General Settings
              </h3>
              <p className='text-app text-secondary-token'>
                Configure app preferences and notifications
              </p>
            </div>
          </div>
          <div className='mt-4'>
            <Button variant='outline' size='sm' asChild>
              <Link href={APP_ROUTES.SETTINGS}>View Settings</Link>
            </Button>
          </div>
        </ContentSurfaceCard>
      </div>

      {/* Account Information */}
      <ContentSurfaceCard className='overflow-hidden p-0'>
        <ContentSectionHeader
          title='Account Information'
          subtitle='Status and privacy settings related to this account.'
          className='px-5 py-3'
        />
        <div className='space-y-4 px-5 py-4'>
          <div>
            <h4 className='text-app font-caption text-primary-token'>
              Account Status
            </h4>
            <p className='text-app text-secondary-token'>
              Your account is active and in good standing
            </p>
          </div>
          <div>
            <h4 className='text-app font-caption text-primary-token'>
              Data & Privacy
            </h4>
            <p className='text-app text-secondary-token'>
              We protect your data according to our privacy policy
            </p>
          </div>
        </div>
      </ContentSurfaceCard>

      {/* Support */}
      <ContentSurfaceCard className='overflow-hidden p-0'>
        <ContentSectionHeader
          title='Need Help?'
          subtitle='Get support, review docs, or contact the team.'
          className='px-5 py-3'
        />
        <div className='flex flex-col gap-3 px-5 py-4 sm:flex-row'>
          <Button variant='outline' size='sm' asChild>
            <Link href='/support'>Contact Support</Link>
          </Button>
          <Button variant='outline' size='sm' asChild>
            <a href={DOCS_URL} target='_blank' rel='noopener noreferrer'>
              View Documentation
            </a>
          </Button>
        </div>
      </ContentSurfaceCard>
    </div>
  );
}
