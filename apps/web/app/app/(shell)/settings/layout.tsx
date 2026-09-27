import { PageShell } from '@/components/canonical';

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
      <div
        className='mx-auto min-w-0 w-full max-w-(--app-shell-content-max-form) space-y-6'
        data-settings-layout-column='true'
      >
        {children}
      </div>
    </PageShell>
  );
}
