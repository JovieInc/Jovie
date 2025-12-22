const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

// Supabase credentials
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey =
  process.env.SUPABASE_SERVICE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Real social media URLs for the artists
const artistSocialLinks = {
  ladygaga: {
    instagram: 'https://instagram.com/ladygaga',
    twitter: 'https://twitter.com/ladygaga',
    tiktok: 'https://tiktok.com/@ladygaga',
    youtube: 'https://youtube.com/@ladygaga',
    spotify: 'https://open.spotify.com/artist/1HY2Jd0NmPuamShAr6KMms',
    website: 'https://www.ladygaga.com/',
  },
  davidguetta: {
    instagram: 'https://instagram.com/davidguetta',
    twitter: 'https://twitter.com/davidguetta',
    tiktok: 'https://tiktok.com/@davidguetta',
    youtube: 'https://youtube.com/@davidguetta',
    spotify: 'https://open.spotify.com/artist/1Cs0zKBU1kc0i8ypK3B9ai',
    website: 'https://www.davidguetta.com/',
  },
  billieeilish: {
    instagram: 'https://instagram.com/billieeilish',
    twitter: 'https://twitter.com/billieeilish',
    tiktok: 'https://tiktok.com/@billieeilish',
    youtube: 'https://youtube.com/@billieeilish',
    spotify: 'https://open.spotify.com/artist/6qqNVTkY8uBg9cP3Jd7DAH',
    website: 'https://www.billieeilish.com/',
  },
  marshmello: {
    instagram: 'https://instagram.com/marshmello',
    twitter: 'https://twitter.com/marshmello',
    tiktok: 'https://tiktok.com/@marshmello',
    youtube: 'https://youtube.com/@marshmello',
    spotify: 'https://open.spotify.com/artist/64KEffDW9EtZ1y2vBYgq8T',
    website: 'https://www.marshmellomusic.com/',
  },
  rihanna: {
    instagram: 'https://instagram.com/badgalriri',
    twitter: 'https://twitter.com/rihanna',
    tiktok: 'https://tiktok.com/@rihanna',
    youtube: 'https://youtube.com/@rihanna',
    spotify: 'https://open.spotify.com/artist/5pKCCKE2ajJHZ9KAiaK11H',
    website: 'https://www.rihanna.com/',
  },
  calvinharris: {
    instagram: 'https://instagram.com/calvinharris',
    twitter: 'https://twitter.com/calvinharris',
    tiktok: 'https://tiktok.com/@calvinharris',
    youtube: 'https://youtube.com/@calvinharris',
    spotify: 'https://open.spotify.com/artist/7CajNmpbOovFoOoasH2HaY',
    website: 'https://www.calvinharris.com/',
  },
  sabrinacarpenter: {
    instagram: 'https://instagram.com/sabrinacarpenter',
    twitter: 'https://twitter.com/sabrinaannlynn',
    tiktok: 'https://tiktok.com/@sabrinacarpenter',
    youtube: 'https://youtube.com/@sabrinacarpenter',
    spotify: 'https://open.spotify.com/artist/74KM79TiuVKeVCqs8QtB0B',
    website: 'https://www.sabrinacarpenter.com/',
  },
  thechainsmokers: {
    instagram: 'https://instagram.com/thechainsmokers',
    twitter: 'https://twitter.com/thechainsmokers',
    tiktok: 'https://tiktok.com/@thechainsmokers',
    youtube: 'https://youtube.com/@thechainsmokers',
    spotify: 'https://open.spotify.com/artist/69GGBxA162lTqCwzJG5jLp',
    website: 'https://www.thechainsmokers.com/',
  },
  dualipa: {
    instagram: 'https://instagram.com/dualipa',
    twitter: 'https://twitter.com/dualipa',
    tiktok: 'https://tiktok.com/@dualipa',
    youtube: 'https://youtube.com/@dualipa',
    spotify: 'https://open.spotify.com/artist/6M2wZ9GZgrQXHCFfjv46we',
    website: 'https://www.dualipa.com/',
  },
  tim: {
    instagram: 'https://instagram.com/itstimwhite',
    twitter: 'https://x.com/itstimwhite',
    tiktok: 'https://tiktok.com/@itstimwhite',
    youtube: 'https://youtube.com/@timwhite',
    spotify: 'https://open.spotify.com/artist/4Uwpa6zW3zzCSQvooQNksm',
    website: 'https://timwhite.co/',
  },
};

// Update social links for an artist
async function updateArtistSocialLinks(handle, socialLinks) {
  try {
    // Get artist ID
    const { data: artist, error: artistError } = await supabase
      .from('artists')
      .select('id')
      .eq('handle', handle)
      .single();

    if (artistError) {
      console.error(`Error finding artist ${handle}:`, artistError);
      return false;
    }

    // Delete existing social links
    await supabase
      .from('social_links')
      .delete()
      .eq('creator_profile_id', artist.id);

    // Insert new social links
    const socialLinksToInsert = Object.entries(socialLinks).map(
      ([platform, url]) => ({
        creator_profile_id: artist.id,
        platform,
        platform_type: platform,
        url,
        sort_order: 0,
        is_active: true,
      })
    );

    const { error: insertError } = await supabase
      .from('social_links')
      .insert(socialLinksToInsert);

    if (insertError) {
      console.error(`Error inserting social links for ${handle}:`, insertError);
      return false;
    }

    console.log(`✅ Updated social links for ${handle}`);
    return true;
  } catch (error) {
    console.error(`Error updating ${handle}:`, error);
    return false;
  }
}

// Main function
async function updateAllSocialLinks() {
  try {
    console.log('🔗 Updating social links for all artists...');

    for (const [handle, socialLinks] of Object.entries(artistSocialLinks)) {
      await updateArtistSocialLinks(handle, socialLinks);
      // Small delay to avoid overwhelming the database
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.log('\n🎉 Finished updating all social links!');
  } catch (error) {
    console.error('❌ Script failed:', error);
  }
}

// Run the script
updateAllSocialLinks();
