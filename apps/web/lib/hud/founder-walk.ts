import { isAccountVideoUrl } from '@/lib/capture/account-video';

export const FOUNDER_WALK_CONFIRM_PATH = '/api/hud/founder-walks';

export function isFounderWalkBlobUrl(url: string): boolean {
  return isAccountVideoUrl(url);
}
