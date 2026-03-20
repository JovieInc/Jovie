import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Investor Portal Settings',
};

/**
 * Admin investor portal settings page.
 * Toggle progress bar, set raise target, configure URLs, etc.
 */
export default function InvestorSettingsPage() {
  return (
    <div className='space-y-6 p-6'>
      <h1 className='text-xl font-semibold'>Investor Portal Settings</h1>
      <p className='text-sm text-muted-foreground'>
        Configure the investor portal appearance and behavior.
      </p>
      {/* TODO: Settings form with toggles and inputs */}
      <div className='rounded-lg border border-dashed p-12 text-center text-sm text-muted-foreground'>
        Settings form — to be wired up with client components
      </div>
    </div>
  );
}
