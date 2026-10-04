import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { APP_ROUTES } from '@/constants/routes';
import { isCodeFlagEnabled } from '@/lib/flags/code-flags';
import { findSmartLinkByCode } from '@/lib/smart-link-mvp/store';

export const dynamic = 'force-dynamic';

const CODE_PATTERN = /^[a-z2-9]{8}$/;

export const metadata: Metadata = {
  title: 'Claim this Jovie link',
  robots: { index: false, follow: false },
};

/**
 * Unclaimed Jovie links have a claim path, like `profile create`.
 * Opening this page does not create an account and does not prove the
 * visitor owns the recording. Ownership is verified later.
 */
export default async function ClaimJovieLinkPage({
  params,
}: {
  readonly params: Promise<{ code: string }>;
}) {
  if (!isCodeFlagEnabled('SMART_LINK_MVP')) notFound();
  const { code } = await params;
  if (!CODE_PATTERN.test(code)) notFound();
  const link = await findSmartLinkByCode(code);
  if (!link) notFound();

  return (
    <main className='mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-4 px-6 py-16'>
      <p className='text-sm text-secondary-token'>Jovie</p>
      <h1 className='text-3xl font-semibold tracking-tight'>
        This Jovie Link Is Unclaimed
      </h1>
      <p className='text-base leading-7 text-secondary-token'>
        {link.title ? `${link.title} is public.` : 'This page is public.'}{' '}
        Nobody owns it yet. Opening this page does not create an account. The
        artist verifies ownership later, the same way an unclaimed Jovie profile
        is claimed.
      </p>
      <p>
        <Link href={`/l/${code}`} className='underline'>
          Open the link
        </Link>
      </p>
      <p>
        <Link href={APP_ROUTES.SMART_LINKS} className='underline'>
          Make your own
        </Link>
      </p>
    </main>
  );
}
