require('dotenv').config({ path: '.env.local' });

// Spotify API credentials
const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;

// Get Spotify access token
async function getSpotifyToken() {
  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization:
        'Basic ' +
        Buffer.from(SPOTIFY_CLIENT_ID + ':' + SPOTIFY_CLIENT_SECRET).toString(
          'base64'
        ),
    },
    body: 'grant_type=client_credentials',
  });

  if (!response.ok) {
    throw new Error(`Failed to get Spotify token: ${response.status}`);
  }

  const data = await response.json();
  return data.access_token;
}

// Search for an artist on Spotify
async function searchSpotifyArtist(artistName, token) {
  const response = await fetch(
    `https://api.spotify.com/v1/search?q=${encodeURIComponent(artistName)}&type=artist&limit=5`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to search Spotify: ${response.status}`);
  }

  const data = await response.json();
  return data.artists.items;
}

// Main function
async function findCorrectSpotifyIds() {
  try {
    console.log('🎵 Fetching Spotify access token...');
    const token = await getSpotifyToken();
    console.log('✅ Got Spotify token');

    const artistsToFix = [
      {
        handle: 'davidguetta',
        name: 'David Guetta',
        currentId: '1Cs0zKBU1kc0i8zK8oBxlK',
      },
      {
        handle: 'calvinharris',
        name: 'Calvin Harris',
        currentId: '7CajNmpbOovfoOQ5XGgU9h',
      },
      {
        handle: 'sabrinacarpenter',
        name: 'Sabrina Carpenter',
        currentId: '1mU3m3BcHkbdQAYM9u0h3q',
      },
    ];

    for (const artist of artistsToFix) {
      console.log(`\n🔍 Searching for ${artist.name}...`);
      const results = await searchSpotifyArtist(artist.name, token);

      console.log(`Found ${results.length} results:`);
      results.forEach((result, index) => {
        console.log(`${index + 1}. ${result.name} (ID: ${result.id})`);
        console.log(`   Popularity: ${result.popularity}`);
        console.log(`   Followers: ${result.followers?.total || 'Unknown'}`);
        console.log(`   Image: ${result.images?.[0]?.url || 'No image'}`);
      });

      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  } catch (error) {
    console.error('❌ Script failed:', error);
  }
}

// Run the script
findCorrectSpotifyIds();
