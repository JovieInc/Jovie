import { PageShell } from '@/components/canonical';

export default function SettingsLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <PageShell
      maxWidth='form'
      frame='none'
      contentPadding='default'
      scroll='page'
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
