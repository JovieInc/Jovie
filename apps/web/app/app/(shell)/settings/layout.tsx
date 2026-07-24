import { PageShell } from '@/components/organisms/PageShell';
import { SettingsSidebar } from '@/features/settings/SettingsSidebar';

export default function SettingsLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <PageShell
      maxWidth='wide'
      frame='none'
      contentPadding='none'
      scroll='page'
      surfaceClassName='pb-10'
      data-testid='settings-shell-content'
    >
      <div className='flex items-start gap-8'>
        {/* Grouped settings navigation — hidden on mobile, where the app
            shell sidebar already exposes the settings sections. */}
        <SettingsSidebar className='max-md:hidden' />
        <div className='min-w-0 max-w-(--app-shell-content-max-form) flex-1 space-y-6'>
          {children}
        </div>
      </div>
    </PageShell>
  );
}
