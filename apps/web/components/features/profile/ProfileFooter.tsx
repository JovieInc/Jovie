import { Footer } from '@/components/organisms/footer-module';
import { Artist } from '@/types/db';

interface ProfileFooterProps {
  readonly artist: Artist;
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
