#!/usr/bin/env node
/*
  update-featured-artists.js
  - Sets specific artists as featured in the database
*/

const { createClient } = require('@supabase/supabase-js');

// The artists we want to feature
const FEATURED_ARTISTS = [
  'popstar',
  'taylorswift',
  'oliviarodrigo',
  'sza',
  'theweeknd',
  'badbunny',
  'karolg',
  'newjeans',
  'pinkpantheress',
];

async function updateFeaturedArtists() {
  console.log('[update-featured] Starting featured artists update...');

  // Get environment variables
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('[update-featured] Missing required environment variables:');
    console.error('- NEXT_PUBLIC_SUPABASE_URL');
    console.error(
      '- SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY'
    );
    process.exit(1);
  }

  // Create client (try service role first, fall back to anon)
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    // First, unfeature all artists
    console.log('[update-featured] Unfeaturing all artists...');
    const { error: unfeaturedError } = await supabase
      .from('creator_profiles')
      .update({ is_featured: false })
      .gt('created_at', '1900-01-01'); // Update all records (always true condition)

    if (unfeaturedError) {
      console.error(
        '[update-featured] Error unfeaturing artists:',
        unfeaturedError
      );
      throw unfeaturedError;
    }

    // Then feature the selected artists
    console.log(
      `[update-featured] Featuring ${FEATURED_ARTISTS.length} artists...`
    );
    const { data: updatedArtists, error: featuredError } = await supabase
      .from('creator_profiles')
      .update({ is_featured: true })
      .in('username', FEATURED_ARTISTS)
      .select('username, display_name, is_featured');

    if (featuredError) {
      console.error(
        '[update-featured] Error featuring artists:',
        featuredError
      );
      throw featuredError;
    }

    console.log('[update-featured] Successfully updated featured artists:');
    updatedArtists?.forEach(artist => {
      console.log(`  ✓ ${artist.display_name} (@${artist.username})`);
    });

    // Verify the results
    const { data: featuredArtists, error: verifyError } = await supabase
      .from('creator_profiles')
      .select('username, display_name')
      .eq('is_featured', true)
      .eq('is_public', true)
      .order('display_name');

    if (verifyError) {
      console.error('[update-featured] Error verifying results:', verifyError);
      throw verifyError;
    }

    console.log(
      `\n[update-featured] Total featured artists: ${featuredArtists?.length || 0}`
    );
    featuredArtists?.forEach(artist => {
      console.log(`  - ${artist.display_name} (@${artist.username})`);
    });

    console.log(
      '\n[update-featured] ✅ Featured artists update completed successfully!'
    );
  } catch (error) {
    console.error('[update-featured] ❌ Update failed:', error);
    process.exit(1);
  }
}

updateFeaturedArtists();
