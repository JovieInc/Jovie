'use client';

import { SettingsSidebar } from '@/features/dashboard/organisms/SettingsSidebar';

export default function SettingsLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className='mx-auto grid w-full max-w-[960px] gap-4 px-3 pb-6 pt-2 sm:px-4 lg:grid-cols-[196px_minmax(0,1fr)] lg:justify-center lg:gap-5 lg:px-5'>
      <div className='lg:sticky lg:top-4 lg:self-start'>
        <SettingsSidebar />
      </div>
      <div className='space-y-4 pb-5 sm:pb-6'>{children}</div>
    </div>
  );
}
