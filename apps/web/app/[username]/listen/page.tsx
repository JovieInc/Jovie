import { redirect } from 'next/navigation';
import { getProfileModeHref } from '@/components/profile/registry';

interface Props {
  readonly params: Promise<{
    readonly username: string;
  }>;
}

export default async function ListenPage({ params }: Props) {
  const { username } = await params;
  redirect(getProfileModeHref(username, 'listen'));
}
