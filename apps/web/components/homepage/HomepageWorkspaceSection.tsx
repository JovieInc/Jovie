'use client';

import {
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from 'motion/react';
import Image, { type ImageLoader } from 'next/image';
import { useEffect, useRef } from 'react';
import { HOMEPAGE_LAUNCH_COPY } from '@/data/homepageLaunchCopy';

type HomepageMarketingImage = {
  readonly publicUrl: string;
  readonly width: number;
  readonly height: number;
  readonly alt: string;
};

const sourceScreenshotLoader: ImageLoader = ({ src, width }) =>
  `${src}?w=${width}`;

export function HomepageWorkspaceSection({
  screenshot,
}: Readonly<{ screenshot: HomepageMarketingImage }>) {
  const sectionRef = useRef<HTMLElement | null>(null);
  const prefersReducedMotion = useReducedMotion();
  const shouldReduceMotion = Boolean(prefersReducedMotion);
  const scrollProgress = useMotionValue(shouldReduceMotion ? 1 : 0);

  useEffect(() => {
    if (shouldReduceMotion) {
      scrollProgress.set(1);
      return;
    }

    const section = sectionRef.current;
    if (!section) return;

    let frame = 0;

    const updateProgress = () => {
      frame = 0;

      const rect = section.getBoundingClientRect();
      const viewportHeight = globalThis.innerHeight || 1;
      const start = viewportHeight * 0.72;
      const end = -rect.height * 0.42;
      const rawProgress = (start - rect.top) / (start - end);
      scrollProgress.set(Math.min(Math.max(rawProgress, 0), 1));
    };

    const scheduleProgressUpdate = () => {
      if (frame) return;
      frame = globalThis.requestAnimationFrame(updateProgress);
    };

    updateProgress();
    globalThis.addEventListener('scroll', scheduleProgressUpdate, {
      passive: true,
    });
    globalThis.addEventListener('resize', scheduleProgressUpdate);

    return () => {
      if (frame) globalThis.cancelAnimationFrame(frame);
      globalThis.removeEventListener('scroll', scheduleProgressUpdate);
      globalThis.removeEventListener('resize', scheduleProgressUpdate);
    };
  }, [scrollProgress, shouldReduceMotion]);

  const mediaOpacity = useTransform(scrollProgress, [0, 0.18], [0.88, 1]);
  const mediaY = useTransform(scrollProgress, [0, 1], [16, -8]);
  const importOpacity = useTransform(
    scrollProgress,
    [0, 0.12, 0.32, 0.58],
    [0.96, 1, 0.97, 0.96]
  );
  const publishOpacity = useTransform(
    scrollProgress,
    [0.18, 0.4, 0.6, 0.82],
    [0.96, 0.98, 1, 0.97]
  );
  const reviewOpacity = useTransform(
    scrollProgress,
    [0.48, 0.66, 0.88, 1],
    [0.96, 0.98, 1, 0.98]
  );
  const importY = useTransform(scrollProgress, [0, 0.26], [8, 0]);
  const publishY = useTransform(scrollProgress, [0.24, 0.58], [8, 0]);
  const reviewY = useTransform(scrollProgress, [0.56, 0.9], [8, 0]);
  const calloutMotion = [
    { opacity: importOpacity, y: importY },
    { opacity: publishOpacity, y: publishY },
    { opacity: reviewOpacity, y: reviewY },
  ] as const;

  return (
    <section
      ref={sectionRef}
      id='release-workspace'
      className='homepage-workspace-section'
      style={{ position: 'relative' }}
      aria-labelledby='homepage-workspace-heading'
      data-testid='homepage-workspace-section'
    >
      <div className='homepage-workspace-section__inner'>
        <div className='homepage-workspace-section__copy'>
          <p className='homepage-section-eyebrow'>
            {HOMEPAGE_LAUNCH_COPY.workspace.kicker}
          </p>
          <h2 id='homepage-workspace-heading'>
            {HOMEPAGE_LAUNCH_COPY.workspace.headlineLines.map(line => (
              <span key={line}>{line}</span>
            ))}
          </h2>
        </div>

        <motion.div
          className='homepage-workspace-visual'
          style={
            shouldReduceMotion
              ? undefined
              : {
                  opacity: mediaOpacity,
                  y: mediaY,
                }
          }
        >
          <div
            className='homepage-workspace-media'
            data-testid='homepage-workspace-screenshot'
          >
            <Image
              src={screenshot.publicUrl}
              alt={screenshot.alt}
              width={screenshot.width}
              height={screenshot.height}
              loader={sourceScreenshotLoader}
              loading='lazy'
              sizes='(min-width: 1280px) 86rem, (min-width: 768px) 94vw, 170vw'
              quality={85}
            />
          </div>

          <ol
            className='homepage-workspace-callouts'
            aria-label='Release workspace flow'
          >
            {HOMEPAGE_LAUNCH_COPY.workspace.callouts.map((callout, index) => (
              <motion.li
                className={`homepage-workspace-callout homepage-workspace-callout--${callout.key}`}
                key={callout.title}
                style={
                  shouldReduceMotion
                    ? undefined
                    : (calloutMotion[index] ?? undefined)
                }
              >
                <span>{callout.number}</span>
                <h3>{callout.title}</h3>
                <p>{callout.body}</p>
              </motion.li>
            ))}
          </ol>
        </motion.div>
      </div>
    </section>
  );
}
