import { notFound } from 'next/navigation';
import { WikiPageArticle } from '@/components/features/admin/wiki/WikiPageArticle';
import {
  getCurrentAdminPageAccess,
  redirectToLogin,
} from '@/lib/admin/page-access';
import { getPage } from '@/lib/wiki/gbrain-client';

interface Props {
  params: Promise<{ slug: string[] }>;
}

export default async function WikiPageView({ params }: Props) {
  const access = await getCurrentAdminPageAccess();
  if (!access.isAdmin) redirectToLogin();

  const { slug: slugParts } = await params;
  const slug = slugParts.join('/');

  const page = await getPage(slug);
  if (!page || !page.compiled_truth) notFound();

  return (
    <div className='mx-auto max-w-4xl px-4 py-8'>
      <WikiPageArticle page={page} />
    </div>
  );
}
