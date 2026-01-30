import { ArtistInfo } from '@/components/molecules/ArtistInfo';
import { FrostedContainer } from '@/components/molecules/FrostedContainer';
import { Container } from '@/components/site/Container';
import { Artist } from '@/types/db';

interface ProfileSectionProps {
  readonly artist: Artist;
  readonly subtitle?: string;
  readonly children?: React.ReactNode;
  readonly containerVariant?: 'default' | 'glass' | 'solid';
  readonly backgroundPattern?: 'grid' | 'dots' | 'gradient' | 'none';
  readonly showGradientBlurs?: boolean;
  readonly avatarSize?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  readonly nameSize?: 'sm' | 'md' | 'lg' | 'xl';
  readonly maxWidthClass?: string;
}

export function ProfileSection({
  artist,
  subtitle,
  children,
  containerVariant = 'default',
  backgroundPattern = 'grid',
  showGradientBlurs = true,
  avatarSize = 'xl',
  nameSize = 'lg',
  maxWidthClass = 'w-full max-w-md',
}: ProfileSectionProps) {
  return (
    <FrostedContainer
      variant={containerVariant}
      backgroundPattern={backgroundPattern}
      showGradientBlurs={showGradientBlurs}
    >
      <Container>
        <div className='flex min-h-screen flex-col py-12 relative z-10'>
          <div className='flex-1 flex flex-col items-center justify-center px-4'>
            <div className={`${maxWidthClass} space-y-8`}>
              <ArtistInfo
                artist={artist}
                subtitle={subtitle}
                avatarSize={avatarSize === '2xl' ? 'xl' : avatarSize}
                nameSize={nameSize}
              />
              {children}
            </div>
          </div>
        </div>
      </Container>
    </FrostedContainer>
  );
}
