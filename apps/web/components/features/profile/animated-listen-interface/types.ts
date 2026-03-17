import type { Artist } from '@/types/db';

export interface AnimatedListenInterfaceProps {
  readonly artist: Artist;
  readonly handle: string;
  readonly enableDynamicEngagement?: boolean;
}
