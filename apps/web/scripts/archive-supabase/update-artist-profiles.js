const { createClient } = require('@supabase/supabase-js');

// Spotify API credentials
const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;

// Supabase credentials
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

// Artist data with real Spotify IDs and profile information
const artists = [
  {
    handle: 'ladygaga',
    spotify_id: '1HY2Jd0NmPuamShAr6KMms',
    name: 'Lady Gaga',
    tagline: 'Born This Way - Chromatica',
    image_url:
      'https://i.scdn.co/image/ab6761610000e5eb8b0b5c5c5c5c5c5c5c5c5c5c',
  },
  {
    handle: 'davidguetta',
    spotify_id: '1Cs0zKBU1kc0i8zK8oBxlK',
    name: 'David Guetta',
    tagline: 'One Love - Future Rave',
    image_url:
      'https://i.scdn.co/image/ab6761610000e5eb8b0b5c5c5c5c5c5c5c5c5c5c',
  },
  {
    handle: 'billieeilish',
    spotify_id: '6qqNVTkY8uBg9cP3Jd7DAH',
    name: 'Billie Eilish',
    tagline: 'Bad Guy - Happier Than Ever',
    image_url:
      'https://i.scdn.co/image/ab6761610000e5eb8b0b5c5c5c5c5c5c5c5c5c5c',
  },
  {
    handle: 'marshmello',
    spotify_id: '64KEffDW9EtZ1y2vBYgq8T',
    name: 'Marshmello',
    tagline: 'Happier - Shockwave',
    image_url:
      'https://i.scdn.co/image/ab6761610000e5eb8b0b5c5c5c5c5c5c5c5c5c5c',
  },
  {
    handle: 'rihanna',
    spotify_id: '5pKCCKE2ajJHZ9KAiaK11H',
    name: 'Rihanna',
    tagline: 'Diamonds - Anti',
    image_url:
      'https://i.scdn.co/image/ab6761610000e5eb8b0b5c5c5c5c5c5c5c5c5c5c',
  },
  {
    handle: 'calvinharris',
    spotify_id: '7CajNmpbOovfoOQ5XGgU9h',
    name: 'Calvin Harris',
    tagline: 'Summer - Funk Wav Bounces Vol. 1',
    image_url:
      'https://i.scdn.co/image/ab6761610000e5eb8b0b5c5c5c5c5c5c5c5c5c5c',
  },
  {
    handle: 'sabrinacarpenter',
    spotify_id: '1mU3m3BcHkbdQAYM9u0h3q',
    name: 'Sabrina Carpenter',
    tagline: 'Nonsense - Emails I Cant Send',
    image_url:
      'https://i.scdn.co/image/ab6761610000e5eb8b0b5c5c5c5c5c5c5c5c5c5c',
  },
  {
    handle: 'thechainsmokers',
    spotify_id: '69GGBxA162lTqCwzJG5jLp',
    name: 'The Chainsmokers',
    tagline: 'Closer - So Far So Good',
    image_url:
      'https://i.scdn.co/image/ab6761610000e5eb8b0b5c5c5c5c5c5c5c5c5c5c',
  },
  {
    handle: 'dualipa',
    spotify_id: '6M2wZ9GZgrQXHCFfjv46we',
    name: 'Dua Lipa',
    tagline: 'Levitating - Future Nostalgia',
    image_url:
      'https://i.scdn.co/image/ab6761610000e5eb8b0b5c5c5c5c5c5c5c5c5c5c',
  },
];

async function getSpotifyToken() {
  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64')}`,
    },
    body: 'grant_type=client_credentials',
  });

  const data = await response.json();
  return data.access_token;
}

async function getArtistProfile(spotifyId, token) {
  const response = await fetch(
    `https://api.spotify.com/v1/artists/${spotifyId}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  const data = await response.json();
  return data;
}

async function updateArtistProfiles() {
  try {
    console.log('Getting Spotify token...');
    const token = await getSpotifyToken();

    console.log('Updating artist profiles...');

    for (const artist of artists) {
      console.log(`Updating ${artist.name}...`);

      try {
        // Get real Spotify data
        const spotifyData = await getArtistProfile(artist.spotify_id, token);

        // Use the highest quality image available
        const imageUrl =
          spotifyData.images && spotifyData.images.length > 0
            ? spotifyData.images[0].url
            : artist.image_url;

        // Update the artist in the database
        const { error } = await supabase
          .from('artists')
          .update({
            image_url: imageUrl,
            tagline: artist.tagline,
            spotify_id: artist.spotify_id,
          })
          .eq('handle', artist.handle);

        if (error) {
          console.error(`Error updating ${artist.name}:`, error);
        } else {
          console.log(`✅ Updated ${artist.name} with image: ${imageUrl}`);
        }

        // Add a small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        console.error(`Error fetching Spotify data for ${artist.name}:`, error);
      }
    }

    console.log('✅ Artist profile update complete!');
  } catch (error) {
    console.error('Error updating artist profiles:', error);
  }
}

// Run the update
updateArtistProfiles();
