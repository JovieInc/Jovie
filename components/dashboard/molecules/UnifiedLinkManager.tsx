'use client';

import React, { useMemo } from 'react';
import { MAX_SOCIAL_LINKS } from '@/constants/app';
import type { LinkItem } from '@/types/links';
import { LinkManager } from './LinkManager';

interface UnifiedLinkManagerProps {
  initialLinks?: LinkItem[];
  onLinksChange: (links: LinkItem[]) => void;
  onLinkAdded?: (links: LinkItem[]) => void;
  disabled?: boolean;
}

export const UnifiedLinkManager: React.FC<UnifiedLinkManagerProps> = ({
  initialLinks = [],
  onLinksChange,
  onLinkAdded,
  disabled = false,
}) => {
  // Separate links by category for display
  const { socialLinks, musicLinks, customLinks } = useMemo(() => {
    const social = initialLinks.filter(
      link => link.platform.category === 'social'
    );
    const music = initialLinks.filter(link => link.platform.category === 'dsp');
    const custom = initialLinks.filter(
      link => link.platform.category === 'custom'
    );

    return {
      socialLinks: social.sort((a, b) => a.order - b.order),
      musicLinks: music.sort((a, b) => a.order - b.order),
      customLinks: custom.sort((a, b) => a.order - b.order),
    };
  }, [initialLinks]);

  const handleLinksChange = (links: LinkItem[]) => {
    onLinksChange(links);
  };

  const handleLinkAdded = (links: LinkItem[]) => {
    if (onLinkAdded) {
      onLinkAdded(links);
    }
  };

  return (
    <div className='space-y-8'>
      {/* Universal Link Input */}
      <div className='bg-surface-1 border border-subtle rounded-xl p-6'>
        <div className='mb-6'>
          <h3 className='text-lg font-semibold text-primary mb-2'>
            ✨ Add Any Link
          </h3>
          <p className='text-sm text-secondary'>
            Paste a link — we’ll detect and organize it for you.
          </p>
        </div>

        <LinkManager
          initialLinks={initialLinks}
          onLinksChange={handleLinksChange}
          onLinkAdded={handleLinkAdded}
          disabled={disabled}
          maxLinks={MAX_SOCIAL_LINKS * 2} // Allow more links total
          allowedCategory='all'
          title=''
          description=''
        />
      </div>

      {/* Organized Link Groups (Collapsible) */}
      {(socialLinks.length > 0 ||
        musicLinks.length > 0 ||
        customLinks.length > 0) && (
        <div className='space-y-4'>
          <div className='flex items-center gap-2'>
            <h3 className='text-lg font-semibold text-primary'>Your Links</h3>
            <span className='text-xs text-secondary bg-surface-2 px-2 py-1 rounded-full'>
              {initialLinks.length}{' '}
              {initialLinks.length === 1 ? 'link' : 'links'}
            </span>
          </div>

          <div className='space-y-3'>
            {/* Social Links Group */}
            {socialLinks.length > 0 && (
              <details className='bg-surface-1 border border-subtle rounded-lg'>
                <summary className='flex items-center justify-between p-3 cursor-pointer select-none'>
                  <div className='flex items-center gap-2'>
                    <div className='w-2 h-2 bg-blue-500 rounded-full'></div>
                    <span className='text-sm font-medium text-primary'>
                      Social
                    </span>
                    <span className='text-xs text-secondary bg-surface-2 px-2 py-0.5 rounded-full'>
                      {socialLinks.length}
                    </span>
                  </div>
                  {(() => {
                    const visible = socialLinks.filter(l => l.isVisible).length;
                    const hidden = socialLinks.length - visible;
                    return (
                      <div className='flex items-center gap-2'>
                        <span className='text-xs text-secondary'>
                          {visible}/{MAX_SOCIAL_LINKS} visible
                        </span>
                        {hidden > 0 && (
                          <span className='text-[10px] text-secondary bg-surface-2 px-2 py-0.5 rounded-full'>
                            {hidden} hidden
                          </span>
                        )}
                      </div>
                    );
                  })()}
                </summary>
                <div className='p-3 pt-0 space-y-2'>
                  {socialLinks.map(link => (
                    <div
                      key={link.id}
                      className='flex items-center gap-2 text-xs text-secondary'
                    >
                      <span className='w-1 h-1 bg-blue-500 rounded-full'></span>
                      <span className='truncate'>
                        {link.platform.name}
                        {!link.isVisible && (
                          <span className='ml-2 text-[10px] text-secondary'>
                            (hidden)
                          </span>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              </details>
            )}

            {/* Music Links Group */}
            {musicLinks.length > 0 && (
              <details className='bg-surface-1 border border-subtle rounded-lg'>
                <summary className='flex items-center justify-between p-3 cursor-pointer select-none'>
                  <div className='flex items-center gap-2'>
                    <div className='w-2 h-2 bg-green-500 rounded-full'></div>
                    <span className='text-sm font-medium text-primary'>
                      Music
                    </span>
                    <span className='text-xs text-secondary bg-surface-2 px-2 py-0.5 rounded-full'>
                      {musicLinks.length}
                    </span>
                  </div>
                </summary>
                <div className='p-3 pt-0 space-y-2'>
                  {musicLinks.map(link => (
                    <div
                      key={link.id}
                      className='flex items-center gap-2 text-xs text-secondary'
                    >
                      <span className='w-1 h-1 bg-green-500 rounded-full'></span>
                      <span className='truncate'>{link.platform.name}</span>
                    </div>
                  ))}
                </div>
              </details>
            )}

            {/* Custom Links Group */}
            {customLinks.length > 0 && (
              <details className='bg-surface-1 border border-subtle rounded-lg'>
                <summary className='flex items-center justify-between p-3 cursor-pointer select-none'>
                  <div className='flex items-center gap-2'>
                    <div className='w-2 h-2 bg-purple-500 rounded-full'></div>
                    <span className='text-sm font-medium text-primary'>
                      Custom
                    </span>
                    <span className='text-xs text-secondary bg-surface-2 px-2 py-0.5 rounded-full'>
                      {customLinks.length}
                    </span>
                  </div>
                </summary>
                <div className='p-3 pt-0 space-y-2'>
                  {customLinks.map(link => (
                    <div
                      key={link.id}
                      className='flex items-center gap-2 text-xs text-secondary'
                    >
                      <span className='w-1 h-1 bg-purple-500 rounded-full'></span>
                      <span className='truncate'>
                        {link.title || link.platform.name}
                      </span>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
