import { redirect } from 'next/navigation';
import type { ProfileMode } from '@/features/profile/contracts';
import { getProfileModeHref } from '@/features/profile/registry';

type RouteParams = Promise<{
  readonly username: string;
}>;

export async function redirectToProfileMode(
  params: RouteParams,
  mode: Exclude<ProfileMode, 'profile'>
) {
  const { username } = await params;
  redirect(getProfileModeHref(username, mode));
}
