'use client';

import dynamic from 'next/dynamic';

// Split (still server-rendered when NEXT_PUBLIC_FEATURE_PROFILE_DESKTOP_SURFACE
// is on) so the flagged desktop surface, and the unified drawer it imports
// statically, stay out of the public profile's hydration work (JOV-11623).
// With the flag off, the default, this chunk never loads.
export const ProfileDesktopSurface = dynamic(() =>
  import('./ProfileDesktopSurface').then(module => module.ProfileDesktopSurface)
);
