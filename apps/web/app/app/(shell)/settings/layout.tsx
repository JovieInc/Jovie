import { PageShell } from '@/components/organisms/PageShell';

export default function SettingsLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <PageShell
      maxWidth='form'
      frame='none'
      contentPadding='none'
      scroll='page'
      surfaceClassName='pb-10'
      data-testid='settings-shell-content'
    >
      <div className='space-y-6'>{children}</div>
    </PageShell>
  );
}
