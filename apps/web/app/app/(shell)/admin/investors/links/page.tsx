import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Investor Links',
};

/**
 * Admin investor links management page.
 * Create new links, copy URLs, toggle active/inactive.
 * Client component for interactivity (create modal, copy to clipboard).
 */
export default function InvestorLinksPage() {
  return (
    <div className='space-y-6 p-6'>
      <div className='flex items-center justify-between'>
        <h1 className='text-xl font-semibold'>Manage Investor Links</h1>
      </div>
      <p className='text-sm text-muted-foreground'>
        Create and manage shareable investor links. Each link has a unique token
        that grants access to the investor portal.
      </p>
      {/* TODO: Client component with create modal, table with actions */}
      <div className='rounded-lg border border-dashed p-12 text-center text-sm text-muted-foreground'>
        Link management UI — to be wired up with client components
      </div>
    </div>
  );
}
