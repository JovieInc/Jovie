'use client';

import { Button } from '@jovie/ui';
import React, { useEffect, useState } from 'react';
import type { DetectedLink } from '@/lib/utils/platform-detection';
import { labelFor } from './utils';

/**
 * Target section types for YouTube cross-category placement
 */
export type YouTubeTargetSection = 'social' | 'dsp';

/**
 * Props for the YouTubeCrossCategoryPrompt component
 */
export interface YouTubeCrossCategoryPromptProps {
  /**
   * The YouTube link candidate to add to another section.
   * If null, the prompt will not render.
   */
  readonly candidate: DetectedLink | null;

  /**
   * The target section to add the YouTube link to.
   * Only 'social' or 'dsp' are valid cross-category targets for YouTube.
   */
  readonly target: YouTubeTargetSection;

  /**
   * Callback when user confirms adding the link to the target section.
   * Receives the candidate link and the target section.
   */
  readonly onConfirm: (
    candidate: DetectedLink,
    target: YouTubeTargetSection
  ) => void;

  /**
   * Callback when user cancels the cross-category prompt.
   */
  readonly onCancel: () => void;

  /**
   * Optional additional CSS classes
   */
  readonly className?: string;

  /**
   * Whether to enable entry/exit animations.
   * Defaults to true.
   */
  readonly animate?: boolean;
}

/**
 * YouTubeCrossCategoryPrompt - Prompt dialog for adding YouTube to multiple sections.
 *
 * YouTube is unique in that it can exist in both the Social and Music Service sections.
 * When a user already has YouTube in one section and tries to add it again,
 * this prompt asks if they want to add it to the other section as well.
 *
 * Features:
 * - Animated entry/exit using CSS transitions (no motion library)
 * - Clear messaging about what adding will do
 * - Confirm and Cancel buttons
 * - Memoized for performance
 *
 * @example
 * ```tsx
 * <YouTubeCrossCategoryPrompt
 *   candidate={ytCandidate}
 *   target="dsp"
 *   onConfirm={(candidate, target) => {
 *     // Add candidate to target section
 *     const adjusted = { ...candidate, platform: { ...candidate.platform, category: target } };
 *     addLink(adjusted);
 *   }}
 *   onCancel={() => setYtPrompt(null)}
 * />
 * ```
 */
export const YouTubeCrossCategoryPrompt = React.memo(
  function YouTubeCrossCategoryPrompt({
    candidate,
    target,
    onConfirm,
    onCancel,
    className,
    animate = true,
  }: YouTubeCrossCategoryPromptProps) {
    // Animation state for CSS transitions
    const [isVisible, setIsVisible] = useState(!animate);

    // Trigger animation on mount
    useEffect(() => {
      if (animate && candidate) {
        // Small delay to allow initial render before animating
        const timer = requestAnimationFrame(() => setIsVisible(true));
        return () => cancelAnimationFrame(timer);
      }
    }, [animate, candidate]);

    // Don't render if no candidate
    if (!candidate) {
      return null;
    }

    /**
     * Get the display name for the target section.
     * For 'dsp', we use "a music service" for better UX.
     */
    const getTargetDisplayName = (): string => {
      if (target === 'dsp') {
        return 'a music service';
      }
      return labelFor(target);
    };

    /**
     * Get the button label for the confirm action.
     */
    const getButtonLabel = (): string => {
      return `Add as ${labelFor(target)}`;
    };

    /**
     * Handle confirm click - pass candidate and target to parent
     */
    const handleConfirm = () => {
      onConfirm(candidate, target);
    };

    const platformName = candidate.platform.name || candidate.platform.id;

    // CSS transition styles
    const transitionStyle = animate
      ? {
          transition: 'opacity 200ms ease-out, transform 200ms ease-out',
          opacity: isVisible ? 1 : 0,
          transform: isVisible ? 'translateY(0)' : 'translateY(-10px)',
        }
      : undefined;

    return (
      <div style={transitionStyle}>
        <dialog
          open
          className={`m-0 flex items-center justify-between gap-3 rounded-lg border border-subtle bg-surface-1 p-3 text-sm ${className ?? ''}`}
          aria-labelledby='yt-cross-category-prompt-title'
          data-testid='youtube-cross-category-prompt'
        >
          <div
            id='yt-cross-category-prompt-title'
            className='text-primary-token'
          >
            You already added {platformName} in this section. Do you also want
            to add it as {getTargetDisplayName()}?
          </div>
          <div className='flex shrink-0 items-center gap-2'>
            <Button size='sm' variant='primary' onClick={handleConfirm}>
              {getButtonLabel()}
            </Button>
            <Button size='sm' variant='outline' onClick={onCancel}>
              Cancel
            </Button>
          </div>
        </dialog>
      </div>
    );
  }
);

YouTubeCrossCategoryPrompt.displayName = 'YouTubeCrossCategoryPrompt';
