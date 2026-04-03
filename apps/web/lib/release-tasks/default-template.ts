/**
 * Default Release Task Template
 *
 * Deterministic, per-release tasks that apply to every single release.
 * No outreach, no indeterminate items — only platform submissions and actions.
 *
 * Items marked ai_workflow are auto-completed by Jovie (locked, pre-checked).
 * Items with explainerText show a ⓘ popover with founder guidance.
 *
 * due_days_offset: negative = before release, 0 = release day, positive = after
 */

export type DefaultTemplateItem = {
  title: string;
  description?: string;
  explainerText?: string;
  learnMoreUrl?: string;
  category: string;
  assigneeType: 'human' | 'ai_workflow';
  aiWorkflowId?: string;
  priority: 'urgent' | 'high' | 'medium' | 'low' | 'none';
  dueDaysOffset: number;
};

export const DEFAULT_RELEASE_TASK_TEMPLATE: DefaultTemplateItem[] = [
  // ─── Distribution ───────────────────────────────────────────────
  {
    title: 'Upload final master to distributor',
    explainerText:
      'Upload your mastered WAV file (16-bit, 44.1kHz) to your distributor. The earlier you upload, the more time DSPs have to process and the better your chances with editorial pitching.',
    category: 'Distribution',
    assigneeType: 'human',
    priority: 'high',
    dueDaysOffset: -30,
  },
  {
    title: 'Enter metadata (ISRC, UPC, credits, genres)',
    explainerText:
      'Complete all metadata fields in your distributor dashboard — ISRC codes, UPC, songwriter credits, genre tags. Accurate metadata directly affects discoverability on streaming platforms.',
    category: 'Distribution',
    assigneeType: 'human',
    priority: 'high',
    dueDaysOffset: -30,
  },
  {
    title: 'Set release date & territories',
    explainerText:
      'Lock in your release date and select territories. Most distributors need at least 7 days, but 28+ days gives you time for editorial pitching.',
    category: 'Distribution',
    assigneeType: 'human',
    priority: 'high',
    dueDaysOffset: -28,
  },
  {
    title: 'Upload lyrics to distributor',
    explainerText:
      'Upload your lyrics through your distributor so they sync to Apple Music and other platforms that display lyrics. This is separate from Genius/Musixmatch.',
    category: 'Distribution',
    assigneeType: 'human',
    priority: 'medium',
    dueDaysOffset: -28,
  },
  {
    title: 'Complete distributor marketing/pitching form',
    explainerText:
      'Most distributors (AWAL, Symphonic, UnitedMasters) have a marketing highlights form for DSP pitching. Fill it out completely — this is how your distributor pitches on your behalf.',
    category: 'Distribution',
    assigneeType: 'human',
    priority: 'high',
    dueDaysOffset: -28,
  },

  // ─── Artwork ────────────────────────────────────────────────────
  {
    title: 'Finalize cover artwork (3000×3000)',
    explainerText:
      'Your cover art must be 3000×3000 pixels, JPEG or PNG. No blurry images, no text that gets cut off at small sizes. This is the first thing people see — make it count.',
    category: 'Artwork',
    assigneeType: 'human',
    priority: 'high',
    dueDaysOffset: -21,
  },

  // ─── DSP Pitching ──────────────────────────────────────────────
  {
    title: 'Pitch to Spotify editorial (Spotify for Artists)',
    explainerText:
      'Submit your pitch through Spotify for Artists at least 28 days before release. You get 500 characters — include your story, 3 genres, mood, and any notable collaborators. Pick the one song that best represents you.',
    category: 'DSP Pitching',
    assigneeType: 'human',
    priority: 'urgent',
    dueDaysOffset: -28,
  },
  {
    title: 'Pitch to Apple Music editorial (via distributor)',
    explainerText:
      'Apple Music editorial pitching goes through your distributor. Make sure your distributor marketing form is complete — that IS your Apple Music pitch. Submit at least 10 days before release.',
    category: 'DSP Pitching',
    assigneeType: 'human',
    priority: 'high',
    dueDaysOffset: -28,
  },
  {
    title: 'Pitch to Amazon Music editorial',
    explainerText:
      'Amazon Music accepts editorial pitches through Amazon Music for Artists. Similar to Spotify — submit early, include genre tags and your story.',
    category: 'DSP Pitching',
    assigneeType: 'human',
    priority: 'medium',
    dueDaysOffset: -28,
  },
  {
    title: 'Pitch to Deezer editorial (via distributor)',
    explainerText:
      'Deezer editorial pitching typically goes through your distributor. Check if your distributor supports Deezer pitching in their marketing form.',
    category: 'DSP Pitching',
    assigneeType: 'human',
    priority: 'low',
    dueDaysOffset: -28,
  },

  // ─── DSP Profile ───────────────────────────────────────────────
  {
    title: 'Upload Spotify Canvas video',
    explainerText:
      'Canvas is the looping video that plays behind your track on Spotify mobile. It increases engagement significantly. Upload through Spotify for Artists — 3-8 second loop, vertical format.',
    category: 'DSP Profile',
    assigneeType: 'human',
    priority: 'medium',
    dueDaysOffset: -7,
  },
  {
    title: 'Upload Apple Music Motion Artwork',
    explainerText:
      'Apple Music supports animated cover art (Motion Artwork). If your distributor supports it, upload an animated version of your cover. Not all distributors offer this yet.',
    category: 'DSP Profile',
    assigneeType: 'human',
    priority: 'low',
    dueDaysOffset: -7,
  },
  {
    title: 'Update Spotify artist bio & press photo',
    explainerText:
      'Spotify editors check your profile before adding you to playlists. Update your bio with recent achievements and upload a current press photo. A polished profile signals professionalism.',
    category: 'DSP Profile',
    assigneeType: 'human',
    priority: 'medium',
    dueDaysOffset: -14,
  },
  {
    title: 'Update Apple Music artist profile',
    explainerText:
      'Update your Apple Music for Artists profile with a current bio and photos. Like Spotify, editorial teams review your profile when considering playlist placements.',
    category: 'DSP Profile',
    assigneeType: 'human',
    priority: 'medium',
    dueDaysOffset: -14,
  },
  {
    title: 'Run Metadata Agent',
    description:
      'Generate the Xperi/AllMusic submission package for this release and review it before sending.',
    explainerText:
      'The Metadata Agent packages your release sheet, artwork, press photos, and artist bio into the format required by manual metadata destinations like Xperi/AllMusic. Review the package, approve the send, then let Jovie track when the updates go live.',
    category: 'DSP Profile',
    assigneeType: 'ai_workflow',
    aiWorkflowId: 'metadata-agent-run',
    priority: 'high',
    dueDaysOffset: -14,
  },

  // ─── Lyrics ────────────────────────────────────────────────────
  {
    title: 'Submit lyrics to Genius',
    explainerText:
      'Genius is the primary lyrics database. Submit your lyrics so fans can find and annotate them. Create an account, add your song, and paste your lyrics.',
    category: 'Lyrics',
    assigneeType: 'human',
    priority: 'medium',
    dueDaysOffset: 0,
  },
  {
    title: 'Submit lyrics to Musixmatch',
    explainerText:
      'Musixmatch powers synced lyrics on Spotify, Instagram, and other platforms. Submit and time-sync your lyrics through their app or website for the best fan experience.',
    category: 'Lyrics',
    assigneeType: 'human',
    priority: 'medium',
    dueDaysOffset: 0,
  },

  // ─── Platform (Jovie auto-tasks) ───────────────────────────────
  {
    title: 'Create Jovie smart link',
    explainerText:
      'Your Jovie smart link automatically aggregates all streaming platform links for this release. Already done for you!',
    category: 'Platform',
    assigneeType: 'ai_workflow',
    aiWorkflowId: 'smart-link-create',
    priority: 'high',
    dueDaysOffset: -1,
  },
  {
    title: 'Feature release on Jovie profile',
    explainerText:
      'Your latest release is automatically featured on your Jovie profile page. Fans visiting your link will see it front and center.',
    category: 'Platform',
    assigneeType: 'ai_workflow',
    aiWorkflowId: 'profile-feature-release',
    priority: 'high',
    dueDaysOffset: -1,
  },

  // ─── Fan Engagement ────────────────────────────────────────────
  {
    title: 'Send fan notification',
    description:
      'Automatic notification to all subscribed fans with album art, track title, and Jovie smart link.',
    explainerText:
      'On release day, Jovie automatically sends a notification to all your subscribed fans with your album art, track title, artist name, and a link to your smart link. Pro accounts get this automatically — it just happens.',
    category: 'Fan Engagement',
    assigneeType: 'ai_workflow',
    aiWorkflowId: 'fan-notification-send',
    priority: 'urgent',
    dueDaysOffset: 0,
  },

  // ─── Post-Release ─────────────────────────────────────────────
  {
    title: 'Review first-week analytics',
    explainerText:
      'Check Spotify for Artists and Apple Music for Artists after your first week. Look at total streams, save rate, playlist adds, and top cities. This data informs your next release strategy.',
    category: 'Post-Release',
    assigneeType: 'human',
    priority: 'medium',
    dueDaysOffset: 7,
  },
];
