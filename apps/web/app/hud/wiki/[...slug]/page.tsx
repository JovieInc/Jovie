import { forbidden, notFound, unauthorized } from 'next/navigation';
import { AdminPage } from '@/components/features/admin/layout/AdminPage';
import { ShellPageTitle } from '@/components/features/admin/layout/ShellPageTitle';
import { WikiPageArticle } from '@/components/features/admin/wiki/WikiPageArticle';
import { getCurrentAdminPageAccess } from '@/lib/admin/page-access';
import { assertOviePrivacyUnlocked } from '@/lib/ovie/privacy-lock/server';
import { getPage } from '@/lib/wiki/gbrain-client';

interface Props {
  readonly params: Promise<{ slug: string[] }>;
}

export default async function WikiPageView({ params }: Props) {
  const access = await getCurrentAdminPageAccess();
  if (access.hasAdminRole) await assertOviePrivacyUnlocked();
  if (!access.isAuthenticated) unauthorized();
  if (!access.hasAdminRole) forbidden();

  const { slug: slugParts } = await params;
  const slug = slugParts.join('/');

  const page = await getPage(slug);
  if (!page || !page.compiled_truth) notFound();

  return (
    <AdminPage title={page.title} testId='admin-wiki-article-page'>
      <ShellPageTitle title={page.title} />
      <div className='mx-auto w-full max-w-4xl'>
        <WikiPageArticle page={page} />
      </div>
    </AdminPage>
  );
}
