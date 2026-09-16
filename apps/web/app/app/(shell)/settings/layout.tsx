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
      <div className='mx-auto w-full space-y-6'>{children}</div>
    </PageShell>
  );
}
