import { getProfileModeHref } from '@/features/profile/registry';
import { getProfileStaticParams } from '../_lib/profile-static-params';
import { PreserveSearchRedirect } from '../[slug]/PreserveSearchRedirect';

interface Props {
  readonly params: Promise<{
    readonly username: string;
  }>;
}

export async function generateStaticParams() {
  return getProfileStaticParams(100);
}

export default async function ListenPage({ params }: Props) {
  const { username } = await params;

  return (
    <PreserveSearchRedirect href={getProfileModeHref(username, 'listen')} />
  );
}
