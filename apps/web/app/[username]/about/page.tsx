import { redirect } from 'next/navigation';
import { getProfileModeHref } from '@/features/profile/registry';

interface Props {
  readonly params: Promise<{
    readonly username: string;
  }>;
}

export default async function AboutPage({ params }: Props) {
  const { username } = await params;
  redirect(getProfileModeHref(username, 'about'));
}
