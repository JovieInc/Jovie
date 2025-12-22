#!/usr/bin/env node

/**
 * Seed script for local development
 * Creates sample artist profiles in the local Supabase database
 */

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'http://127.0.0.1:54321';
const supabaseServiceKey =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

async function seedArtists() {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  console.log('🌱 Seeding local artist profiles...');

  // Sample users (these would normally be created by Clerk)
  const users = [
    { id: 'artist_1', email: 'ladygaga@example.com' },
    { id: 'artist_2', email: 'davidguetta@example.com' },
    { id: 'artist_3', email: 'billieeilish@example.com' },
    { id: 'artist_4', email: 'marshmello@example.com' },
    { id: 'artist_5', email: 'tim@example.com' },
  ];

  // Creator profiles with proper data
  const creatorProfiles = [
    {
      user_id: 'artist_1',
      creator_type: 'artist',
      username: 'ladygaga',
      display_name: 'Lady Gaga',
      bio: 'Grammy Award-winning artist known for hits like "Bad Romance" and "Shallow". Advocate for mental health awareness and LGBTQ+ rights.',
      avatar_url:
        'https://i.scdn.co/image/ab6761610000e5ebc36dd9eb55fb0db4911f25dd',
      spotify_url: 'https://open.spotify.com/artist/1HY2Jd0NmPuamShAr6KMms',
      spotify_id: '1HY2Jd0NmPuamShAr6KMms',
      is_public: true,
    },
    {
      user_id: 'artist_2',
      creator_type: 'artist',
      username: 'davidguetta',
      display_name: 'David Guetta',
      bio: 'French DJ and music producer. Pioneer of electronic dance music with hits like "Titanium" and "When Love Takes Over".',
      avatar_url:
        'https://i.scdn.co/image/ab6761610000e5eb150e1b9e6ae26e8d7b3fb5a2',
      is_public: true,
    },
    {
      user_id: 'artist_3',
      creator_type: 'artist',
      username: 'billieeilish',
      display_name: 'Billie Eilish',
      bio: 'Multi-Grammy Award winner known for her unique sound and style. Albums include "When We All Fall Asleep, Where Do We Go?" and "Happier Than Ever".',
      avatar_url:
        'https://i.scdn.co/image/ab6761610000e5eb7aa2e8b4b7b87781b1c4dc52',
      is_public: true,
    },
    {
      user_id: 'artist_4',
      creator_type: 'artist',
      username: 'marshmello',
      display_name: 'Marshmello',
      bio: 'Electronic music producer and DJ known for tracks like "Alone" and "Happier". Recognized by the iconic marshmallow helmet.',
      avatar_url:
        'https://i.scdn.co/image/ab6761610000e5eba85b8b1a09c9bf5b5e0dad0e',
      is_public: true,
    },
    {
      user_id: 'artist_5',
      creator_type: 'artist',
      username: 'tim',
      display_name: 'Tim White',
      bio: 'Independent artist exploring electronic and ambient sounds. Latest release: "Never Say A Word" (2024).',
      avatar_url:
        'https://i.scdn.co/image/ab6761610000e5ebbab7ca6e76db7da72b58aa5c',
      is_public: true,
    },
  ];

  try {
    // Insert users first
    console.log('📝 Creating sample users...');
    const { error: usersError } = await supabase
      .from('app_users')
      .upsert(users, { onConflict: 'id' });

    if (usersError) {
      console.error('Error creating users:', usersError);
      return;
    }

    // Insert creator profiles
    console.log('🎵 Creating creator profiles...');
    const { data, error: profilesError } = await supabase
      .from('creator_profiles')
      .upsert(creatorProfiles, { onConflict: 'username' })
      .select();

    if (profilesError) {
      console.error('Error creating creator profiles:', profilesError);
      return;
    }

    console.log(`✅ Successfully created ${data.length} creator profiles:`);
    data.forEach(profile => {
      console.log(
        `   - ${profile.display_name} (@${profile.username}) [${profile.creator_type}]`
      );
    });

    console.log('\n🚀 Local development setup complete!');
    console.log(
      '   Visit http://localhost:3003/ladygaga to test a creator profile'
    );
  } catch (error) {
    console.error('❌ Seeding failed:', error);
  }
}

// Run the seed script
if (require.main === module) {
  seedArtists().catch(console.error);
}

module.exports = { seedArtists };
