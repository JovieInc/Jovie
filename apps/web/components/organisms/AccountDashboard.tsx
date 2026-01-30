'use client';

import { Button } from '@jovie/ui';
import { CreditCard, Settings, User } from 'lucide-react';
import Link from 'next/link';
import { APP_ROUTES } from '@/constants/routes';

export function AccountDashboard() {
  return (
    <div className='space-y-6'>
      {/* Header */}
      <div>
        <h1 className='text-3xl font-bold text-gray-900 dark:text-white'>
          Account Settings
        </h1>
        <p className='mt-2 text-gray-700 dark:text-gray-300'>
          Manage your account preferences and settings
        </p>
      </div>

      {/* Quick Actions */}
      <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'>
        {/* Billing & Subscription */}
        <div className='bg-white dark:bg-gray-800 shadow rounded-lg p-6'>
          <div className='flex items-center'>
            <div className='shrink-0'>
              <CreditCard className='h-8 w-8 text-blue-500' />
            </div>
            <div className='ml-4'>
              <h3 className='text-lg font-medium text-gray-900 dark:text-white'>
                Billing & Subscription
              </h3>
              <p className='text-sm text-gray-700 dark:text-gray-300'>
                Manage your subscription and payment methods
              </p>
            </div>
          </div>
          <div className='mt-4'>
            <Button variant='outline' size='sm' asChild>
              <Link href={APP_ROUTES.SETTINGS_BILLING}>Manage Billing</Link>
            </Button>
          </div>
        </div>

        {/* Profile Settings */}
        <div className='bg-white dark:bg-gray-800 shadow rounded-lg p-6'>
          <div className='flex items-center'>
            <div className='shrink-0'>
              <User className='h-8 w-8 text-green-500' />
            </div>
            <div className='ml-4'>
              <h3 className='text-lg font-medium text-gray-900 dark:text-white'>
                Creator Profile
              </h3>
              <p className='text-sm text-gray-700 dark:text-gray-300'>
                Update your public profile and links
              </p>
            </div>
          </div>
          <div className='mt-4'>
            <Button variant='outline' size='sm' asChild>
              <Link href={APP_ROUTES.PROFILE}>Edit Profile</Link>
            </Button>
          </div>
        </div>

        {/* General Settings */}
        <div className='bg-white dark:bg-gray-800 shadow rounded-lg p-6'>
          <div className='flex items-center'>
            <div className='shrink-0'>
              <Settings className='h-8 w-8 text-purple-500' />
            </div>
            <div className='ml-4'>
              <h3 className='text-lg font-medium text-gray-900 dark:text-white'>
                General Settings
              </h3>
              <p className='text-sm text-gray-700 dark:text-gray-300'>
                Configure app preferences and notifications
              </p>
            </div>
          </div>
          <div className='mt-4'>
            <Button variant='outline' size='sm' asChild>
              <Link href={APP_ROUTES.SETTINGS}>View Settings</Link>
            </Button>
          </div>
        </div>
      </div>

      {/* Account Information */}
      <div className='bg-white dark:bg-gray-800 shadow rounded-lg p-6'>
        <h3 className='text-lg font-medium text-gray-900 dark:text-white mb-4'>
          Account Information
        </h3>
        <div className='space-y-4'>
          <div>
            <h4 className='text-sm font-medium text-gray-900 dark:text-white'>
              Account Status
            </h4>
            <p className='text-sm text-gray-700 dark:text-gray-300'>
              Your account is active and in good standing
            </p>
          </div>
          <div>
            <h4 className='text-sm font-medium text-gray-900 dark:text-white'>
              Data & Privacy
            </h4>
            <p className='text-sm text-gray-700 dark:text-gray-300'>
              We protect your data according to our privacy policy
            </p>
          </div>
        </div>
      </div>

      {/* Support */}
      <div className='bg-white dark:bg-gray-800 shadow rounded-lg p-6'>
        <h3 className='text-lg font-medium text-gray-900 dark:text-white mb-4'>
          Need Help?
        </h3>
        <p className='text-sm text-gray-700 dark:text-gray-300 mb-4'>
          Get support, view documentation, or contact our team
        </p>
        <div className='flex flex-col sm:flex-row gap-3'>
          <Button variant='outline' size='sm' asChild>
            <Link href='/support'>Contact Support</Link>
          </Button>
          <Button variant='outline' size='sm' asChild>
            <Link href='/docs'>View Documentation</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
