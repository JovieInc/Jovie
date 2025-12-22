const { createClient } = require('@supabase/supabase-js');

// Supabase credentials
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function verifyArtists() {
  try {
    console.log('Verifying artist profiles...\n');

    // Get all artists
    const { data: artists, error } = await supabase
      .from('artists')
      .select('*')
      .eq('published', true);

    if (error) {
      console.error('Error fetching artists:', error);
      return;
    }

    console.log(`Found ${artists.length} published artists:\n`);

    artists.forEach((artist, index) => {
      console.log(`${index + 1}. ${artist.name} (@${artist.handle})`);
      console.log(`   Spotify ID: ${artist.spotify_id}`);
      console.log(`   Tagline: ${artist.tagline}`);
      console.log(`   Image URL: ${artist.image_url}`);
      console.log(`   Published: ${artist.published}`);
      console.log('');
    });

    // Check for missing data
    const artistsWithMissingData = artists.filter(
      artist => !artist.spotify_id || !artist.image_url || !artist.tagline
    );

    if (artistsWithMissingData.length > 0) {
      console.log('⚠️  Artists with missing data:');
      artistsWithMissingData.forEach(artist => {
        console.log(`   - ${artist.name}:`);
        if (!artist.spotify_id) console.log('     Missing Spotify ID');
        if (!artist.image_url) console.log('     Missing image URL');
        if (!artist.tagline) console.log('     Missing tagline');
      });
    } else {
      console.log('✅ All artists have complete profile data!');
    }

    // Test image URLs
    console.log('\nTesting image URLs...');
    for (const artist of artists) {
      try {
        const response = await fetch(artist.image_url, { method: 'HEAD' });
        if (response.ok) {
          console.log(`✅ ${artist.name}: Image accessible`);
        } else {
          console.log(
            `❌ ${artist.name}: Image not accessible (${response.status})`
          );
        }
      } catch (error) {
        console.log(`❌ ${artist.name}: Image error - ${error.message}`);
      }
    }
  } catch (error) {
    console.error('Error verifying artists:', error);
  }
}

// Run the verification
verifyArtists();
