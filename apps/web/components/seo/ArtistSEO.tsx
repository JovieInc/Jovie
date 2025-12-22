import { APP_URL } from '@/constants/app';
import { Artist, SocialLink } from '@/types/db';

interface ArtistSEOProps {
  artist: Artist;
  socialLinks: SocialLink[];
}

export function ArtistSEO({ artist, socialLinks }: ArtistSEOProps) {
  const profileUrl = `${APP_URL}/${artist.handle}`;
  const imageUrl = artist.image_url || `${APP_URL}/og/default.png`;

  // Generate additional structured data for music
  const musicStructuredData = {
    '@context': 'https://schema.org',
    '@type': 'MusicGroup',
    '@id': `${profileUrl}#musicgroup`,
    name: artist.name,
    description: artist.tagline || `Music by ${artist.name}`,
    url: profileUrl,
    image: imageUrl,
    sameAs: socialLinks
      .filter(link =>
        ['instagram', 'twitter', 'facebook', 'youtube', 'tiktok'].includes(
          link.platform.toLowerCase()
        )
      )
      .map(link => link.url),
    genre: ['Music', 'Entertainment'],
    foundingLocation: {
      '@type': 'Place',
      name: 'Global',
    },
    // Add verification status
    ...(artist.is_verified && {
      additionalProperty: {
        '@type': 'PropertyValue',
        name: 'verified',
        value: true,
      },
    }),
  };

  // Generate breadcrumb structured data
  const breadcrumbStructuredData = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Home',
        item: APP_URL,
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Artists',
        item: `${APP_URL}/artists`,
      },
      {
        '@type': 'ListItem',
        position: 3,
        name: artist.name,
        item: profileUrl,
      },
    ],
  };

  return (
    <>
      {/* Music Group Structured Data */}
      <script
        type='application/ld+json'
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(musicStructuredData),
        }}
      />

      {/* Breadcrumb Structured Data */}
      <script
        type='application/ld+json'
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(breadcrumbStructuredData),
        }}
      />

      {/* Additional meta tags for better SEO */}
      <meta name='author' content={artist.name} />
      <meta name='creator' content={artist.name} />
      <meta name='publisher' content='Jovie' />
      <meta
        name='robots'
        content='index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1'
      />

      {/* Music-specific meta tags */}
      <meta name='music:musician' content={artist.name} />
      <meta name='music:album' content={artist.tagline || 'Latest Music'} />
      <meta name='music:genre' content='Music' />

      {/* Verification meta tag */}
      {artist.is_verified && <meta name='music:verified' content='true' />}

      {/* Social media meta tags */}
      <meta property='og:type' content='profile' />
      <meta
        property='og:profile:first_name'
        content={artist.name?.split(' ')[0] || ''}
      />
      <meta
        property='og:profile:last_name'
        content={artist.name?.split(' ').slice(1).join(' ') || ''}
      />
      <meta property='og:profile:username' content={artist.handle} />

      {/* Twitter specific meta tags */}
      <meta name='twitter:creator' content='@jovieapp' />
      <meta name='twitter:site' content='@jovieapp' />

      {/* Additional SEO meta tags */}
      <link rel='canonical' href={profileUrl} />
      <meta name='geo.region' content='US' />
      <meta name='geo.placename' content='Global' />
      <meta name='language' content='English' />
      <meta name='revisit-after' content='7 days' />
      <meta name='distribution' content='global' />
      <meta name='rating' content='general' />
    </>
  );
}
