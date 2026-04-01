import { AppShellContentPanel } from '@/components/organisms/AppShellContentPanel';

export default function SettingsLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <AppShellContentPanel
      maxWidth='form'
      frame='none'
      contentPadding='none'
      scroll='page'
      surfaceClassName='pb-10'
      data-testid='settings-shell-content'
    >
      <div className='space-y-6'>{children}</div>
    </AppShellContentPanel>
  );
}
