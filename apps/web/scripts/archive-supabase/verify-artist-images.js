const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

// Supabase credentials
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey =
  process.env.SUPABASE_SERVICE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

if (!supabaseUrl) {
  console.error('Missing Supabase URL in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Verify artist images
async function verifyArtistImages() {
  try {
    console.log('🔍 Verifying artist images...\n');

    // Get all published artists
    const { data: artists, error } = await supabase
      .from('artists')
      .select('handle, name, image_url, spotify_id, is_verified')
      .eq('published', true)
      .order('name');

    if (error) {
      console.error('Error fetching artists:', error);
      return;
    }

    console.log(`📝 Found ${artists.length} published artists:\n`);

    let allGood = true;
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

    for (const artist of artists) {
      const isSeedArtist = seedArtists.includes(artist.handle);
      const hasImage =
        artist.image_url &&
        artist.image_url.startsWith('https://i.scdn.co/image/');
      const hasSpotifyId = artist.spotify_id && artist.spotify_id.length > 0;

      const status = hasImage && hasSpotifyId ? '✅' : '❌';
      const seedStatus = isSeedArtist ? '🌱' : '';

      console.log(`${status} ${seedStatus} ${artist.name} (${artist.handle})`);
      console.log(
        `   Image: ${hasImage ? '✅ Valid Spotify URL' : '❌ Missing or invalid'}`
      );
      console.log(
        `   Spotify ID: ${hasSpotifyId ? '✅ Present' : '❌ Missing'}`
      );
      console.log(`   Verified: ${artist.is_verified ? '✅' : '❌'}`);

      if (!hasImage || !hasSpotifyId) {
        allGood = false;
      }

      console.log('');
    }

    if (allGood) {
      console.log('🎉 All artists have proper images and Spotify IDs!');
    } else {
      console.log('⚠️ Some artists need image updates. Run the update script:');
      console.log('   pnpm run update-artist-images');
    }
  } catch (error) {
    console.error('❌ Verification failed:', error);
  }
}

// Run the verification
verifyArtistImages();
