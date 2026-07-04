import { WikiNamespaceSection } from '@/components/features/admin/wiki/WikiNamespaceSection';
import { WikiSearchForm } from '@/components/features/admin/wiki/WikiSearchForm';
import { WikiSearchResults } from '@/components/features/admin/wiki/WikiSearchResults';
import { WikiUnavailableNotice } from '@/components/features/admin/wiki/WikiUnavailableNotice';
import {
  getCurrentAdminPageAccess,
  redirectToLogin,
} from '@/lib/admin/page-access';
import { listPages, searchPages } from '@/lib/wiki/gbrain-client';
import { groupByNamespace } from '@/lib/wiki/namespace';

interface Props {
  searchParams: Promise<{ q?: string }>;
}

export default async function WikiIndexPage({ searchParams }: Props) {
  const access = await getCurrentAdminPageAccess();
  if (!access.isAdmin) redirectToLogin();

  const { q } = await searchParams;
  const hasQuery = typeof q === 'string' && q.trim().length > 0;

  const pages = hasQuery ? await searchPages(q.trim()) : await listPages();

  const noBackend = hasQuery ? false : pages.length === 0;

  return (
    <div className='mx-auto max-w-4xl px-4 py-8'>
      <h1 className='mb-6 text-2xl font-bold tracking-tight'>Company Wiki</h1>
      <WikiSearchForm initialQuery={q} />
      {noBackend ? (
        <WikiUnavailableNotice />
      ) : hasQuery ? (
        <WikiSearchResults results={pages} query={q || ''} />
      ) : (
        <div className='mt-6 space-y-8'>
          {groupByNamespace(pages).map(group => (
            <WikiNamespaceSection key={group.namespace} group={group} />
          ))}
        </div>
      )}
    </div>
  );
}
