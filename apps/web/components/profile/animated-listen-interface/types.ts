import type { Artist } from '@/types/db';

export interface AnimatedListenInterfaceProps {
  artist: Artist;
  handle: string;
  enableDynamicEngagement?: boolean;
}
