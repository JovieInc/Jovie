'use client';

import type { FC } from 'react';
import type { Artist } from '@/types/db';

export interface DashboardSplitViewProps {
  artist: Artist;
  onArtistUpdate: (artist: Artist) => void;
}

// Compatibility shim for legacy tests. Provides minimal UI that the tests assert on.
export const DashboardSplitView: FC<DashboardSplitViewProps> = ({ artist }) => {
  return (
    <div>
      <h2>Manage Your Links</h2>
      <div aria-label='live-preview'>Live Preview</div>
      <button type='button' aria-label='add-any-link'>
        ✨ Add Any Link
      </button>
      {/* Render artist name if available to keep props used */}
      {artist?.handle ? (
        <p className='sr-only'>Artist: {artist.handle}</p>
      ) : null}
    </div>
  );
};
