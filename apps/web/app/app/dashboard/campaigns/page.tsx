import { Megaphone } from 'lucide-react';
import { redirect } from 'next/navigation';
import { getCachedAuth } from '@/lib/auth/cached';
import { getDashboardData } from '../actions';

export const metadata = {
  title: 'Campaigns | Jovie',
  description: 'Create and manage marketing campaigns',
};

export default async function CampaignsPage() {
  const { userId } = await getCachedAuth();

  if (!userId) {
    redirect('/signin?redirect_url=/app/dashboard/campaigns');
  }

  const dashboardData = await getDashboardData();

  if (dashboardData.needsOnboarding) {
    redirect('/onboarding');
  }

  return (
    <div className='flex flex-1 flex-col'>
      <div className='flex items-center justify-between border-b border-white/10 px-6 py-4'>
        <div>
          <h1 className='text-2xl font-semibold text-white'>Campaigns</h1>
          <p className='text-sm text-white/60'>
            Create and manage marketing campaigns
          </p>
        </div>
      </div>

      <div className='flex flex-1 items-center justify-center p-8'>
        <div className='flex max-w-md flex-col items-center text-center'>
          <div className='mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-white/5'>
            <Megaphone className='h-8 w-8 text-white/40' />
          </div>
          <h2 className='mb-2 text-xl font-medium text-white'>
            Campaigns Coming Soon
          </h2>
          <p className='text-white/60'>
            Create targeted campaigns to grow your audience and promote your
            releases. This feature is currently in development.
          </p>
        </div>
      </div>
    </div>
  );
}
