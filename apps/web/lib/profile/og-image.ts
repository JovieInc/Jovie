import { BASE_URL } from '@/constants/app';

export function getProfileOgImageUrl(username: string): string {
  return `${BASE_URL}/api/og/${encodeURIComponent(username.toLowerCase())}`;
}
