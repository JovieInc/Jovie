'use client';

import { SettingsSidebar } from '@/features/dashboard/organisms/SettingsSidebar';

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className='mx-auto grid w-full max-w-[920px] gap-5 px-3 pb-6 pt-1 sm:px-4 lg:grid-cols-[200px_minmax(0,1fr)] lg:justify-center lg:gap-6 lg:px-5'>
      <div className='lg:sticky lg:top-4 lg:self-start'>
        <SettingsSidebar />
      </div>
      <div className='space-y-5 pb-5 sm:pb-6'>{children}</div>
    </div>
  );
}
