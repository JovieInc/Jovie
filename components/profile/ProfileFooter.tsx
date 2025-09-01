import { Footer } from '@/components/organisms/Footer';
import { Artist } from '@/types/db';

interface ProfileFooterProps {
  artist: Artist;
}

export function ProfileFooter({ artist }: ProfileFooterProps) {
  return (
    <Footer
      variant='profile'
      artistHandle={artist.handle}
      artistSettings={artist.settings}
    />
  );
}
