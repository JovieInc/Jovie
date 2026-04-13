'use client';

import Link from 'next/link';
import {
  startTransition,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Container } from '@/components/site/Container';
import { APP_ROUTES } from '@/constants/routes';
import { LandingCTAButton } from '@/features/landing/LandingCTAButton';
import { HomeProfileShowcase } from './HomeProfileShowcase';
import {
  HOME_HERO_CONTENT,
  HOME_STORY_SCENES,
  type HomeProofAvailability,
  type HomeStoryScene,
  type HomeStorySceneId,
} from './home-scroll-scenes';

interface HomeAdaptiveProfileStoryProps {
  readonly proofAvailability: HomeProofAvailability;
}

type SceneVariant = 'desktop' | 'mobile';
type ObservedSceneKey = `${HomeStorySceneId}:${SceneVariant}`;

export interface ObservedSceneState {
  readonly sceneId: HomeStorySceneId;
  readonly isIntersecting: boolean;
  readonly intersectionRatio: number;
  readonly top: number;
}

function toSceneKey(
  sceneId: HomeStorySceneId,
  variant: SceneVariant
): ObservedSceneKey {
  return `${sceneId}:${variant}`;
}

export function selectActiveSceneId(
  scenes: readonly ObservedSceneState[],
  fallback: HomeStorySceneId
): HomeStorySceneId {
  const intersectingScenes = scenes.filter(scene => scene.isIntersecting);

  if (intersectingScenes.length === 0) {
    return fallback;
  }

  const topScene = [...intersectingScenes].sort((left, right) => {
    return Math.abs(left.top) - Math.abs(right.top);
  })[0];

  if (topScene) {
    return topScene.sceneId;
  }

  const strongestScene = [...intersectingScenes].sort((left, right) => {
    if (right.intersectionRatio !== left.intersectionRatio) {
      return right.intersectionRatio - left.intersectionRatio;
    }

    return Math.abs(left.top) - Math.abs(right.top);
  })[0];

  return strongestScene ? strongestScene.sceneId : fallback;
}

function HomeHeroCopy({
  proofAvailability,
}: Readonly<{
  proofAvailability: HomeProofAvailability;
}>) {
  return (
    <div className='max-w-[35rem] lg:max-w-[39rem]'>
      <p className='homepage-section-eyebrow'>{HOME_HERO_CONTENT.eyebrow}</p>
      <h1 className='marketing-h1-linear mt-5 max-w-[12ch] text-primary-token'>
        {HOME_HERO_CONTENT.title}
      </h1>
      <p className='marketing-lead-linear mt-5 max-w-[31rem] text-secondary-token lg:max-w-[33rem]'>
        {HOME_HERO_CONTENT.body}
      </p>

      <div
        data-testid='homepage-hero-url-lockup'
        className='homepage-hero-url-lockup mt-6'
      >
        {HOME_HERO_CONTENT.vanityUrl}
      </div>

      <div className='mt-8 flex flex-wrap items-center gap-3'>
        <LandingCTAButton
          href={APP_ROUTES.SIGNUP}
          label={HOME_HERO_CONTENT.primaryCtaLabel}
          eventName='landing_cta_claim_profile'
          section='hero'
          testId='homepage-primary-cta'
        />

        {proofAvailability === 'visible' ? (
          <Link
            href='#homepage-live-proof'
            className='public-action-secondary focus-ring-themed'
            data-testid='homepage-secondary-cta'
          >
            {HOME_HERO_CONTENT.secondaryCtaLabel}
          </Link>
        ) : null}
      </div>
    </div>
  );
}

function DesktopScene({
  scene,
  setSceneRef,
}: Readonly<{
  readonly scene: HomeStoryScene;
  readonly setSceneRef: (
    sceneId: HomeStorySceneId,
    variant: SceneVariant
  ) => (node: HTMLElement | null) => void;
}>) {
  return (
    <article
      ref={setSceneRef(scene.id, 'desktop')}
      data-scene-id={scene.id}
      data-scene-key={toSceneKey(scene.id, 'desktop')}
      data-testid={`homepage-story-scene-${scene.id}`}
      className='homepage-story-scene flex min-h-[88vh] items-center'
    >
      <div className='max-w-[30rem]'>
        <h2 className='text-[2rem] font-[700] tracking-[-0.032em] text-primary-token'>
          {scene.headline}
        </h2>
        <p className='mt-4 max-w-[27rem] text-[16px] leading-[1.75] text-secondary-token'>
          {scene.body}
        </p>
      </div>
    </article>
  );
}

function MobileScene({
  scene,
  setSceneRef,
}: Readonly<{
  readonly scene: HomeStoryScene;
  readonly setSceneRef: (
    sceneId: HomeStorySceneId,
    variant: SceneVariant
  ) => (node: HTMLElement | null) => void;
}>) {
  return (
    <article
      ref={setSceneRef(scene.id, 'mobile')}
      data-scene-id={scene.id}
      data-scene-key={toSceneKey(scene.id, 'mobile')}
      data-testid={`homepage-mobile-scene-${scene.id}`}
      className='homepage-mobile-scene border-t border-subtle/70 py-14 first:border-t-0 first:pt-0'
    >
      <div className='max-w-[24rem]'>
        <h2 className='text-[1.7rem] font-[700] tracking-[-0.03em] text-primary-token'>
          {scene.headline}
        </h2>
        <p className='mt-3 text-[15px] leading-[1.74] text-secondary-token'>
          {scene.body}
        </p>
      </div>
    </article>
  );
}

export function HomeAdaptiveProfileStory({
  proofAvailability,
}: Readonly<HomeAdaptiveProfileStoryProps>) {
  const [activeSceneId, setActiveSceneId] = useState<HomeStorySceneId>(
    HOME_STORY_SCENES[0].id
  );
  const activeSceneIdRef = useRef<HomeStorySceneId>(HOME_STORY_SCENES[0].id);
  const sceneNodesRef = useRef<Record<ObservedSceneKey, HTMLElement | null>>(
    {} as Record<ObservedSceneKey, HTMLElement | null>
  );
  const sceneStatesRef = useRef<Record<ObservedSceneKey, ObservedSceneState>>(
    {} as Record<ObservedSceneKey, ObservedSceneState>
  );

  useEffect(() => {
    activeSceneIdRef.current = activeSceneId;
  }, [activeSceneId]);

  const setSceneRef = useCallback(
    (sceneId: HomeStorySceneId, variant: SceneVariant) =>
      (node: HTMLElement | null) => {
        const key = toSceneKey(sceneId, variant);

        if (node === null) {
          sceneNodesRef.current[key] = null;
          return;
        }

        sceneNodesRef.current[key] = node;
      },
    []
  );

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') {
      return undefined;
    }

    const sceneNodes = Object.values(sceneNodesRef.current).filter(
      (node): node is HTMLElement => node !== null
    );

    if (sceneNodes.length === 0) {
      return undefined;
    }

    const observer = new IntersectionObserver(
      entries => {
        const focusLine = globalThis.innerHeight * 0.38;

        entries.forEach(entry => {
          const sceneKey = entry.target.getAttribute('data-scene-key');
          const sceneId = entry.target.getAttribute('data-scene-id');

          if (!sceneKey || !sceneId) {
            return;
          }

          sceneStatesRef.current[sceneKey as ObservedSceneKey] = {
            sceneId: sceneId as HomeStorySceneId,
            isIntersecting: entry.isIntersecting,
            intersectionRatio: entry.intersectionRatio,
            top: entry.boundingClientRect.top - focusLine,
          };
        });

        const nextSceneId = selectActiveSceneId(
          Object.values(sceneStatesRef.current),
          activeSceneIdRef.current
        );

        if (nextSceneId !== activeSceneIdRef.current) {
          startTransition(() => {
            setActiveSceneId(nextSceneId);
          });
        }
      },
      {
        rootMargin: '-24% 0px -24% 0px',
        threshold: [0.2, 0.45, 0.7],
      }
    );

    sceneNodes.forEach(node => observer.observe(node));

    return () => {
      observer.disconnect();
    };
  }, []);

  const activeScene =
    HOME_STORY_SCENES.find(scene => scene.id === activeSceneId) ??
    HOME_STORY_SCENES[0];

  return (
    <section
      className='relative pb-16 pt-[5.75rem] md:pb-20 md:pt-[6.25rem] lg:pb-0'
      data-testid='homepage-shell'
      aria-label='Homepage adaptive profile story'
    >
      <div
        aria-hidden='true'
        className='pointer-events-none absolute inset-0'
        style={{ background: 'var(--linear-hero-backdrop)' }}
      />
      <div className='hero-glow pointer-events-none absolute inset-x-0 top-0 h-[38rem]' />

      <Container size='homepage'>
        <div className='mx-auto max-w-[1200px] lg:hidden'>
          <HomeHeroCopy proofAvailability={proofAvailability} />

          <div
            data-testid='homepage-mobile-phone-rail'
            className='homepage-mobile-phone-stage sticky top-[calc(var(--linear-header-height)+1rem)] z-10 mt-10'
          >
            <HomeProfileShowcase stateId={activeScene.showcaseState} compact />
          </div>

          <div className='mt-10' data-testid='homepage-mobile-story'>
            {HOME_STORY_SCENES.map(scene => (
              <MobileScene
                key={scene.id}
                scene={scene}
                setSceneRef={setSceneRef}
              />
            ))}
          </div>
        </div>

        <div className='mx-auto hidden max-w-[1200px] lg:grid lg:grid-cols-[minmax(0,38rem)_minmax(0,1fr)] lg:gap-12 xl:gap-16'>
          <div>
            <div className='homepage-hero-stage flex min-h-[calc(100vh-var(--linear-header-height)-2rem)] flex-col justify-center pb-20 pt-10'>
              <HomeHeroCopy proofAvailability={proofAvailability} />
            </div>

            {HOME_STORY_SCENES.map(scene => (
              <DesktopScene
                key={scene.id}
                scene={scene}
                setSceneRef={setSceneRef}
              />
            ))}
          </div>

          <div className='relative'>
            <div
              data-testid='homepage-desktop-phone-rail'
              className='homepage-phone-rail sticky top-[calc(var(--linear-header-height)+2.5rem)] flex min-h-[calc(100vh-var(--linear-header-height)-3rem)] items-center justify-center pb-10'
            >
              <div
                aria-hidden='true'
                className='hero-cluster-glow pointer-events-none absolute left-1/2 top-1/2 h-[36rem] w-[36rem] -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl'
              />
              <HomeProfileShowcase stateId={activeScene.showcaseState} />
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
