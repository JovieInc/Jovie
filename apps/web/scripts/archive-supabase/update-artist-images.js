const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Spotify API credentials
const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;

if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET) {
  console.error('Missing Spotify environment variables');
  process.exit(1);
}

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

  const data = await response.json();
  return data.access_token;
}

async function getArtistImage(spotifyId, token) {
  try {
    const response = await fetch(
      `https://api.spotify.com/v1/artists/${spotifyId}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const artist = await response.json();

    // Get the highest quality image
    if (artist.images && artist.images.length > 0) {
      // Sort by width to get the highest quality image
      const sortedImages = artist.images.sort((a, b) => b.width - a.width);
      return sortedImages[0].url;
    }

    return null;
  } catch (error) {
    console.error(
      `Error fetching image for artist ${spotifyId}:`,
      error.message
    );
    return null;
  }
}

async function updateArtistImages() {
  try {
    console.log('Getting Spotify access token...');
    const token = await getSpotifyToken();

    console.log('Fetching artists from database...');
    const { data: artists, error } = await supabase
      .from('artists')
      .select('id, handle, spotify_id, name')
      .not('spotify_id', 'is', null);

    if (error) {
      throw error;
    }

    console.log(`Found ${artists.length} artists to update`);

    for (const artist of artists) {
      console.log(
        `Fetching image for ${artist.name} (${artist.spotify_id})...`
      );

      const imageUrl = await getArtistImage(artist.spotify_id, token);

      if (imageUrl) {
        console.log(`Updating ${artist.name} with image: ${imageUrl}`);

        const { error: updateError } = await supabase
          .from('artists')
          .update({ image_url: imageUrl })
          .eq('id', artist.id);

        if (updateError) {
          console.error(`Error updating ${artist.name}:`, updateError);
        } else {
          console.log(`✅ Updated ${artist.name}`);
        }
      } else {
        console.log(`⚠️  No image found for ${artist.name}`);
      }

      // Rate limiting - wait 100ms between requests
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.log('✅ Artist image update complete!');
  } catch (error) {
    console.error('Error updating artist images:', error);
    process.exit(1);
  }
}

updateArtistImages();
