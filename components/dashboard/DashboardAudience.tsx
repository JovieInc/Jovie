'use client';

import { UserGroupIcon } from '@heroicons/react/24/outline';
import { Button } from '@jovie/ui';
import { useState } from 'react';
import type { DashboardData } from '@/app/dashboard/actions';
import { SectionHeader } from '@/components/dashboard/molecules/SectionHeader';
import { Artist, convertDrizzleCreatorProfileToArtist } from '@/types/db';

interface DashboardAudienceProps {
  initialData: DashboardData;
}

export function DashboardAudience({ initialData }: DashboardAudienceProps) {
  const [artist] = useState<Artist | null>(
    initialData.selectedProfile
      ? convertDrizzleCreatorProfileToArtist(initialData.selectedProfile)
      : null
  );
  // Note: Profile switching functionality will be implemented in the future

  if (!artist) {
    return null; // This shouldn't happen given the server-side logic
  }

  return (
    <div>
      <div className='mb-8'>
        <h1 className='text-2xl font-bold text-primary-token'>Audience CRM</h1>
        <p className='text-secondary-token mt-1'>
          Manage your fans and build lasting relationships
        </p>
      </div>

      {/* CRM Coming Soon */}
      <div className='relative'>
        {/* Blurred placeholder table */}
        <div className='filter blur-sm pointer-events-none select-none'>
          <div className='bg-surface-1 backdrop-blur-sm rounded-lg border border-subtle overflow-hidden'>
            <SectionHeader
              title='Fan Contacts'
              right={
                <div className='flex items-center gap-2'>
                  <Button variant='outline' size='sm'>
                    Export
                  </Button>
                  <Button variant='primary' size='sm'>
                    Add Contact
                  </Button>
                </div>
              }
            />

            <table className='w-full'>
              <thead className='bg-surface-2/50'>
                <tr>
                  <th className='px-6 py-3 text-left text-xs font-medium text-secondary-token uppercase tracking-wider'>
                    Name
                  </th>
                  <th className='px-6 py-3 text-left text-xs font-medium text-secondary-token uppercase tracking-wider'>
                    Email
                  </th>
                  <th className='px-6 py-3 text-left text-xs font-medium text-secondary-token uppercase tracking-wider'>
                    Location
                  </th>
                  <th className='px-6 py-3 text-left text-xs font-medium text-secondary-token uppercase tracking-wider'>
                    Last Interaction
                  </th>
                  <th className='px-6 py-3 text-left text-xs font-medium text-secondary-token uppercase tracking-wider'>
                    Tags
                  </th>
                  <th className='px-6 py-3 text-left text-xs font-medium text-secondary-token uppercase tracking-wider'>
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className='divide-y divide-subtle'>
                {[...Array(8)].map((_, i) => (
                  <tr key={i} className='hover:bg-surface-2/30'>
                    <td className='px-6 py-4 whitespace-nowrap'>
                      <div className='flex items-center'>
                        <div className='h-8 w-8 rounded-full bg-gradient-to-br from-purple-400 to-blue-500'></div>
                        <div className='ml-3'>
                          <div className='text-sm font-medium text-primary-token'>
                            Fan Name {i + 1}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className='px-6 py-4 whitespace-nowrap'>
                      <div className='text-sm text-secondary-token'>
                        fan{i + 1}@email.com
                      </div>
                    </td>
                    <td className='px-6 py-4 whitespace-nowrap'>
                      <div className='text-sm text-secondary-token'>
                        Los Angeles, CA
                      </div>
                    </td>
                    <td className='px-6 py-4 whitespace-nowrap'>
                      <div className='text-sm text-secondary-token'>
                        2 days ago
                      </div>
                    </td>
                    <td className='px-6 py-4 whitespace-nowrap'>
                      <span className='px-2 py-1 text-xs rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300'>
                        VIP
                      </span>
                    </td>
                    <td className='px-6 py-4 whitespace-nowrap text-sm'>
                      <button className='text-accent hover:text-accent/80'>
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Coming Soon Overlay */}
        <div className='absolute inset-0 flex items-center justify-center'>
          <div className='bg-surface-1/95 backdrop-blur-md rounded-2xl p-8 max-w-md text-center shadow-2xl border border-subtle'>
            <div className='inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-purple-500 to-blue-600 rounded-full mb-4'>
              <UserGroupIcon className='w-8 h-8 text-primary-token' />
            </div>

            <h2 className='text-2xl font-bold text-primary-token mb-2'>
              Coming Soon
            </h2>

            <p className='text-secondary-token'>
              We&apos;re working on this feature.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
