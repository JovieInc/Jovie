'use client';

import {
  motion,
  useReducedMotion,
  useScroll,
  useTransform,
} from 'motion/react';
import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { HOMEPAGE_LAUNCH_COPY } from '@/data/homepageLaunchCopy';

type HomepageMarketingImage = {
  readonly publicUrl: string;
  readonly width: number;
  readonly height: number;
  readonly alt: string;
};

export function HomepageWorkspaceSection({
  screenshot,
}: Readonly<{ screenshot: HomepageMarketingImage }>) {
  const sectionRef = useRef<HTMLElement | null>(null);
  // isMounted is false on the server and during the initial hydration render,
  // so MotionValue style props are deferred until after mount. This ensures
  // server HTML and the first client render are identical (zero hydration mismatch).
  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => {
    setIsMounted(true);
  }, []);

  const prefersReducedMotion = useReducedMotion();
  // Use a stable initial value of false that matches the server render.
  // After mount, isMounted is true and we read the real preference.
  const shouldReduceMotion = isMounted && Boolean(prefersReducedMotion);
  const headlineLines = HOMEPAGE_LAUNCH_COPY.workspace.headline.split('\n');

  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ['start 84%', 'end 18%'],
  });

  const mediaOpacity = useTransform(scrollYProgress, [0, 0.22], [0.88, 1]);
  const mediaY = useTransform(scrollYProgress, [0, 0.38], [24, 0]);
  const importOpacity = useTransform(
    scrollYProgress,
    [0, 0.12, 0.32, 0.58],
    [0.72, 1, 0.97, 0.92]
  );
  const publishOpacity = useTransform(
    scrollYProgress,
    [0.18, 0.4, 0.6, 0.82],
    [0.64, 0.92, 1, 0.95]
  );
  const reviewOpacity = useTransform(
    scrollYProgress,
    [0.48, 0.66, 0.88, 1],
    [0.62, 0.86, 1, 0.96]
  );
  const importY = useTransform(scrollYProgress, [0, 0.26], [8, 0]);
  const publishY = useTransform(scrollYProgress, [0.24, 0.58], [8, 0]);
  const reviewY = useTransform(scrollYProgress, [0.56, 0.9], [8, 0]);
  const calloutMotion = [
    { opacity: importOpacity, y: importY },
    { opacity: publishOpacity, y: publishY },
    { opacity: reviewOpacity, y: reviewY },
  ] as const;

  return (
    <section
      ref={sectionRef}
      id='release-workspace'
      className='homepage-workspace-section system-b-mounted-home-workspace'
      style={{ position: 'relative' }}
      aria-labelledby='homepage-workspace-heading'
      data-testid='homepage-workspace-section'
    >
      <div className='homepage-workspace-section__inner system-b-mounted-home-workspace-inner'>
        <div className='homepage-workspace-section__copy system-b-mounted-home-workspace-copy'>
          <h2
            id='homepage-workspace-heading'
            className='system-b-mounted-home-workspace-headline'
          >
            {headlineLines.map(line => (
              <span key={line}>{line}</span>
            ))}
          </h2>
        </div>

        <motion.div
          className='homepage-workspace-visual system-b-mounted-home-workspace-visual'
          style={
            // Only apply MotionValues after client mount to prevent hydration
            // mismatch between SSR-serialised styles and client initial render.
            isMounted && !shouldReduceMotion
              ? {
                  opacity: mediaOpacity,
                  y: mediaY,
                }
              : undefined
          }
        >
          <div
            className='homepage-workspace-media system-b-mounted-home-workspace-media'
            data-testid='homepage-workspace-screenshot'
          >
            <Image
              src={screenshot.publicUrl}
              alt={screenshot.alt}
              width={screenshot.width}
              height={screenshot.height}
              loading='lazy'
              fetchPriority='low'
              sizes='(min-width: 1280px) 86rem, (min-width: 768px) 94vw, 170vw'
            />
          </div>

          <ol
            className='homepage-workspace-callouts system-b-mounted-home-workspace-callouts'
            aria-label='Release Workspace Flow'
          >
            {HOMEPAGE_LAUNCH_COPY.workspace.callouts.map((callout, index) => (
              <motion.li
                className={`homepage-workspace-callout system-b-mounted-home-workspace-callout homepage-workspace-callout--${callout.key}`}
                key={callout.title}
                style={
                  // Same guard: only bind MotionValues after mount.
                  isMounted && !shouldReduceMotion
                    ? (calloutMotion[index] ?? undefined)
                    : undefined
                }
              >
                <span className='system-b-mounted-home-workspace-callout-label'>
                  {callout.number}
                </span>
                <h3 className='system-b-mounted-home-workspace-callout-title'>
                  {callout.title}
                </h3>
                <p className='system-b-mounted-home-workspace-callout-body'>
                  {callout.body}
                </p>
              </motion.li>
            ))}
          </ol>
        </motion.div>
      </div>
    </section>
  );
}
