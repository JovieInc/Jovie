const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

// Spotify API credentials
const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;

// Supabase credentials
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey =
  process.env.SUPABASE_SERVICE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET) {
  console.error('Missing Spotify credentials in .env.local');
  process.exit(1);
}

if (!supabaseUrl) {
  console.error('Missing Supabase URL in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

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

// Get artist data from Spotify
async function getSpotifyArtist(artistId, token) {
  const response = await fetch(
    `https://api.spotify.com/v1/artists/${artistId}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch artist from Spotify: ${response.status}`);
  }

  return response.json();
}

// Get artist's latest release
async function getArtistLatestRelease(artistId, token) {
  const response = await fetch(
    `https://api.spotify.com/v1/artists/${artistId}/albums?include_groups=album,single&limit=1&market=US`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch albums from Spotify: ${response.status}`);
  }

  const data = await response.json();
  return data.items[0] || null;
}

// Verify image URL is accessible
async function verifyImageUrl(imageUrl) {
  try {
    const response = await fetch(imageUrl, { method: 'HEAD' });
    return response.ok;
  } catch {
    return false;
  }
}

// Update artist in database
async function updateArtist(handle, spotifyData, latestRelease) {
  const { error } = await supabase
    .from('artists')
    .update({
      image_url: spotifyData.images[0]?.url || null,
      tagline: latestRelease
        ? `${latestRelease.name} - ${latestRelease.album_type}`
        : spotifyData.name,
    })
    .eq('handle', handle);

  if (error) {
    console.error(`Error updating ${handle}:`, error);
    return false;
  }

  console.log(`✅ Updated ${handle} with image: ${spotifyData.images[0]?.url}`);
  return true;
}

// Main function to ensure valid artist images
async function ensureValidArtistImages() {
  try {
    console.log('🎵 Ensuring all seed artists have valid Spotify images...\n');

    // Get Spotify token
    console.log('🔑 Fetching Spotify access token...');
    const token = await getSpotifyToken();
    console.log('✅ Got Spotify token\n');

    // Get all published artists
    const { data: artists, error } = await supabase
      .from('artists')
      .select('handle, spotify_id, name, image_url, is_verified')
      .eq('published', true)
      .order('name');

    if (error) {
      console.error('Error fetching artists:', error);
      return;
    }

    console.log(`📝 Found ${artists.length} published artists to verify\n`);

    const seedArtists = [
      'ladygaga',
      'davidguetta',
      'billieeilish',
      'marshmello',
      'rihanna',
      'calvinharris',
      'sabrinacarpenter',
      'thechainsmokers',
      'dualipa',
      'tim',
    ];

    let updatedCount = 0;
    let verifiedCount = 0;

    for (const artist of artists) {
      const isSeedArtist = seedArtists.includes(artist.handle);
      const seedStatus = isSeedArtist ? '🌱' : '';

      console.log(
        `${seedStatus} Processing ${artist.name} (${artist.handle})...`
      );

      try {
        // Check if current image is valid
        const currentImageValid =
          artist.image_url &&
          artist.image_url.startsWith('https://i.scdn.co/image/') &&
          (await verifyImageUrl(artist.image_url));

        if (!currentImageValid) {
          console.log(
            `   ⚠️ Current image invalid or missing, fetching from Spotify...`
          );

          // Get fresh data from Spotify
          const spotifyData = await getSpotifyArtist(artist.spotify_id, token);
          const latestRelease = await getArtistLatestRelease(
            artist.spotify_id,
            token
          );

          // Update database
          const success = await updateArtist(
            artist.handle,
            spotifyData,
            latestRelease
          );
          if (success) updatedCount++;
        } else {
          console.log(`   ✅ Current image is valid: ${artist.image_url}`);
          verifiedCount++;
        }

        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        console.error(
          `   ❌ Error processing ${artist.handle}:`,
          error.message
        );
      }

      console.log('');
    }

    console.log('📊 Summary:');
    console.log(`   ✅ Verified images: ${verifiedCount}`);
    console.log(`   🔄 Updated images: ${updatedCount}`);
    console.log(`   📝 Total artists: ${artists.length}`);

    if (updatedCount > 0) {
      console.log('\n🎉 Successfully updated artist images!');
    } else {
      console.log('\n🎉 All artist images are already valid!');
    }
  } catch (error) {
    console.error('❌ Script failed:', error);
  }
}

// Run the script
ensureValidArtistImages();
