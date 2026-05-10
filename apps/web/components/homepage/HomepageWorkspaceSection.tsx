'use client';

import {
  motion,
  useReducedMotion,
  useScroll,
  useTransform,
} from 'motion/react';
import Image from 'next/image';
import { useRef } from 'react';
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
  const prefersReducedMotion = useReducedMotion();
  const shouldReduceMotion = Boolean(prefersReducedMotion);
  const headlineLines = HOMEPAGE_LAUNCH_COPY.workspace.headline.split('\n');

  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ['start 84%', 'end 18%'],
  });

  const mediaOpacity = useTransform(scrollYProgress, [0, 0.22], [0.78, 1]);
  const mediaY = useTransform(scrollYProgress, [0, 0.5, 1], [96, -16, 0]);
  const mediaScale = useTransform(
    scrollYProgress,
    [0, 0.48, 1],
    [0.94, 1.012, 1]
  );
  const mediaRotateX = useTransform(scrollYProgress, [0, 0.72], [6, 0]);
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
  const importY = useTransform(scrollYProgress, [0, 0.26], [18, 0]);
  const publishY = useTransform(scrollYProgress, [0.24, 0.58], [18, 0]);
  const reviewY = useTransform(scrollYProgress, [0.56, 0.9], [18, 0]);
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
          <h2 id='homepage-workspace-heading'>
            {headlineLines.map(line => (
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
                  scale: mediaScale,
                  rotateX: mediaRotateX,
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
              loading='lazy'
              fetchPriority='low'
              sizes='(min-width: 1280px) 86rem, (min-width: 768px) 94vw, 170vw'
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
