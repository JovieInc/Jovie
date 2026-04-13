'use client';

import Link from 'next/link';
import {
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
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
import { HomeTipConversionCards } from './HomeTipConversionCards';
import {
  HOME_HERO_CONTENT,
  HOME_PRIMARY_CHAPTERS,
  HOME_STORY_SCENES,
  type HomePrimaryChapter,
  type HomePrimarySubscene,
  type HomePrimarySubsceneId,
  type HomeProofAvailability,
  type HomeStoryStage,
} from './home-scroll-scenes';

interface HomeAdaptiveProfileStoryProps {
  readonly proofAvailability: HomeProofAvailability;
}

type SceneVariant = 'desktop' | 'mobile';
type ObservedSceneKey = `${HomePrimarySubsceneId}:${SceneVariant}`;

export interface ObservedSceneState {
  readonly sceneId: HomePrimarySubsceneId;
  readonly isIntersecting: boolean;
  readonly intersectionRatio: number;
  readonly top: number;
}

function syncActiveScene(
  scenes: readonly ObservedSceneState[],
  activeSceneIdRef: MutableRefObject<HomePrimarySubsceneId>,
  setActiveSceneId: Dispatch<SetStateAction<HomePrimarySubsceneId>>
) {
  const nextSceneId = selectActiveSceneId(scenes, activeSceneIdRef.current);

  if (nextSceneId !== activeSceneIdRef.current) {
    startTransition(() => {
      setActiveSceneId(nextSceneId);
    });
  }
}

function toSceneKey(
  sceneId: HomePrimarySubsceneId,
  variant: SceneVariant
): ObservedSceneKey {
  return `${sceneId}:${variant}`;
}

function getChapterForScene(
  sceneId: HomePrimarySubsceneId
): HomePrimaryChapter | undefined {
  return HOME_PRIMARY_CHAPTERS.find(chapter =>
    chapter.subscenes.some(scene => scene.id === sceneId)
  );
}

export function selectActiveSceneId(
  scenes: readonly ObservedSceneState[],
  fallback: HomePrimarySubsceneId
): HomePrimarySubsceneId {
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
    <div className='max-w-[36rem]'>
      <h1
        id='home-hero-heading'
        className='marketing-h1-linear max-w-[11.5ch] text-primary-token'
      >
        {HOME_HERO_CONTENT.title}
      </h1>
      <p className='marketing-lead-linear mt-6 max-w-[34rem] text-secondary-token'>
        {HOME_HERO_CONTENT.body}
      </p>

      <div
        data-testid='homepage-hero-url-lockup'
        className='homepage-hero-url-lockup mt-7'
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

function DesktopShowcase({
  stage,
  stateId,
}: Readonly<{
  stage: HomeStoryStage;
  stateId: HomePrimarySubscene['showcaseState'];
}>) {
  return (
    <div
      data-testid={
        stage === 'hero'
          ? 'homepage-hero-phone-stage'
          : 'homepage-desktop-phone-rail'
      }
      className={
        stage === 'hero'
          ? 'homepage-hero-phone-shell'
          : 'homepage-phone-rail sticky top-[calc(var(--linear-header-height)+1.25rem)] flex min-h-[calc(100vh-var(--linear-header-height)-1.5rem)] items-center justify-start pb-10 pl-1 xl:pl-3 2xl:pl-8'
      }
      data-story-stage={stage}
    >
      <div
        aria-hidden='true'
        className={
          stage === 'hero'
            ? 'homepage-hero-phone-glow pointer-events-none absolute left-1/2 top-1/2 h-[24rem] w-[24rem] -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl'
            : 'homepage-story-phone-glow pointer-events-none absolute left-1/2 top-1/2 h-[33rem] w-[33rem] -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl'
        }
      />
      <HomeProfileShowcase
        stateId={stateId}
        className={
          stage === 'hero'
            ? 'homepage-showcase-hero'
            : 'homepage-showcase-story'
        }
      />
    </div>
  );
}

function DesktopSubscene({
  scene,
  activeSceneId,
  setSceneRef,
}: Readonly<{
  readonly scene: HomePrimarySubscene;
  readonly activeSceneId: HomePrimarySubsceneId;
  readonly setSceneRef: (
    sceneId: HomePrimarySubsceneId,
    variant: SceneVariant
  ) => (node: HTMLElement | null) => void;
}>) {
  const isActive = activeSceneId === scene.id;

  return (
    <article
      ref={setSceneRef(scene.id, 'desktop')}
      data-scene-id={scene.id}
      data-scene-key={toSceneKey(scene.id, 'desktop')}
      data-testid={`homepage-story-scene-${scene.id}`}
      className='homepage-primary-scene-trigger'
      data-active={isActive ? 'true' : 'false'}
      aria-hidden='true'
    >
      <span className='sr-only'>{scene.body}</span>
    </article>
  );
}

function MobileSubscene({
  scene,
  activeSceneId,
  setSceneRef,
}: Readonly<{
  readonly scene: HomePrimarySubscene;
  readonly activeSceneId: HomePrimarySubsceneId;
  readonly setSceneRef: (
    sceneId: HomePrimarySubsceneId,
    variant: SceneVariant
  ) => (node: HTMLElement | null) => void;
}>) {
  const isActive = activeSceneId === scene.id;

  return (
    <article
      ref={setSceneRef(scene.id, 'mobile')}
      data-scene-id={scene.id}
      data-scene-key={toSceneKey(scene.id, 'mobile')}
      data-testid={`homepage-mobile-scene-${scene.id}`}
      className='homepage-primary-subscene homepage-primary-subscene-mobile'
      data-active={isActive ? 'true' : 'false'}
    >
      <p className='homepage-primary-subscene-body'>{scene.body}</p>
    </article>
  );
}

function DesktopChapter({
  chapter,
  activeSceneId,
  setSceneRef,
}: Readonly<{
  readonly chapter: HomePrimaryChapter;
  readonly activeSceneId: HomePrimarySubsceneId;
  readonly setSceneRef: (
    sceneId: HomePrimarySubsceneId,
    variant: SceneVariant
  ) => (node: HTMLElement | null) => void;
}>) {
  const activeScene =
    chapter.subscenes.find(scene => scene.id === activeSceneId) ??
    chapter.subscenes[0];

  return (
    <section
      data-testid={`homepage-story-chapter-${chapter.id}`}
      className='homepage-primary-chapter hidden xl:grid'
    >
      <div className='homepage-primary-chapter-sticky'>
        <div className='homepage-primary-chapter-copy-shell'>
          <h2 className='homepage-primary-chapter-title'>{chapter.headline}</h2>
          <p className='homepage-primary-chapter-support'>
            {chapter.supportLine}
          </p>
          <div aria-hidden='true' className='homepage-primary-progress'>
            {chapter.subscenes.map(scene => (
              <span
                key={scene.id}
                className='homepage-primary-progress-segment'
                data-active={activeScene.id === scene.id ? 'true' : 'false'}
              />
            ))}
          </div>
          <div
            className='homepage-primary-subscene-stage'
            data-active-scene={activeScene.id}
          >
            <p className='homepage-primary-subscene-current'>
              {activeScene.body}
            </p>
          </div>
          {chapter.id === 'tips' ? (
            <HomeTipConversionCards activeSceneId={activeScene.id} />
          ) : null}
        </div>
      </div>

      <div className='homepage-primary-scene-trigger-stack'>
        {chapter.subscenes.map(scene => (
          <DesktopSubscene
            key={scene.id}
            scene={scene}
            activeSceneId={activeSceneId}
            setSceneRef={setSceneRef}
          />
        ))}
      </div>
    </section>
  );
}

function MobileChapter({
  chapter,
  activeSceneId,
  setSceneRef,
}: Readonly<{
  readonly chapter: HomePrimaryChapter;
  readonly activeSceneId: HomePrimarySubsceneId;
  readonly setSceneRef: (
    sceneId: HomePrimarySubsceneId,
    variant: SceneVariant
  ) => (node: HTMLElement | null) => void;
}>) {
  return (
    <section
      data-testid={`homepage-mobile-chapter-${chapter.id}`}
      className='homepage-mobile-chapter xl:hidden'
    >
      <div className='homepage-mobile-chapter-header'>
        <h2 className='homepage-primary-chapter-title'>{chapter.headline}</h2>
        <p className='homepage-primary-chapter-support'>
          {chapter.supportLine}
        </p>
      </div>

      <div className='homepage-primary-subscene-stack'>
        {chapter.subscenes.map(scene => (
          <MobileSubscene
            key={scene.id}
            scene={scene}
            activeSceneId={activeSceneId}
            setSceneRef={setSceneRef}
          />
        ))}
      </div>
      {chapter.id === 'tips' ? (
        <HomeTipConversionCards activeSceneId={activeSceneId} compact />
      ) : null}
    </section>
  );
}

export function HomeAdaptiveProfileStory({
  proofAvailability,
}: Readonly<HomeAdaptiveProfileStoryProps>) {
  const [activeSceneId, setActiveSceneId] = useState<HomePrimarySubsceneId>(
    HOME_STORY_SCENES[0].id
  );
  const activeSceneIdRef = useRef<HomePrimarySubsceneId>(
    HOME_STORY_SCENES[0].id
  );
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
    (sceneId: HomePrimarySubsceneId, variant: SceneVariant) =>
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
        const focusLine = globalThis.innerHeight * 0.42;

        entries.forEach(entry => {
          const sceneKey = entry.target.getAttribute('data-scene-key');
          const sceneId = entry.target.getAttribute('data-scene-id');

          if (!sceneKey || !sceneId) {
            return;
          }

          sceneStatesRef.current[sceneKey as ObservedSceneKey] = {
            sceneId: sceneId as HomePrimarySubsceneId,
            isIntersecting: entry.isIntersecting,
            intersectionRatio: entry.intersectionRatio,
            top: entry.boundingClientRect.top - focusLine,
          };
        });

        syncActiveScene(
          Object.values(sceneStatesRef.current),
          activeSceneIdRef,
          setActiveSceneId
        );
      },
      {
        rootMargin: '-18% 0px -22% 0px',
        threshold: [0.18, 0.4, 0.68],
      }
    );

    sceneNodes.forEach(node => observer.observe(node));

    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    let frameId = 0;

    const updateFromLayout = () => {
      frameId = 0;

      const focusLine = window.innerHeight * 0.42;
      const layoutScenes = Object.entries(sceneNodesRef.current).flatMap(
        ([sceneKey, node]) => {
          if (!node || !node.isConnected) {
            return [];
          }

          const rect = node.getBoundingClientRect();
          if (rect.height === 0 && rect.top === 0 && rect.bottom === 0) {
            return [];
          }

          const visibleHeight =
            Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0);
          const intersectionRatio =
            rect.height > 0 ? Math.max(0, visibleHeight) / rect.height : 0;
          const sceneId = node.getAttribute('data-scene-id');

          if (!sceneId) {
            return [];
          }

          const isIntersecting =
            rect.bottom > 0 && rect.top < window.innerHeight;
          const nextScene = {
            sceneId: sceneId as HomePrimarySubsceneId,
            isIntersecting,
            intersectionRatio,
            top: rect.top - focusLine,
          };

          sceneStatesRef.current[sceneKey as ObservedSceneKey] = nextScene;
          return [nextScene];
        }
      );

      if (layoutScenes.length === 0) {
        return;
      }

      syncActiveScene(layoutScenes, activeSceneIdRef, setActiveSceneId);
    };

    const scheduleUpdate = () => {
      if (frameId !== 0) {
        return;
      }

      frameId = window.requestAnimationFrame(updateFromLayout);
    };

    scheduleUpdate();
    window.addEventListener('scroll', scheduleUpdate, { passive: true });
    window.addEventListener('resize', scheduleUpdate);

    return () => {
      if (frameId !== 0) {
        window.cancelAnimationFrame(frameId);
      }

      window.removeEventListener('scroll', scheduleUpdate);
      window.removeEventListener('resize', scheduleUpdate);
    };
  }, []);

  const activeScene =
    HOME_STORY_SCENES.find(scene => scene.id === activeSceneId) ??
    HOME_STORY_SCENES[0];
  const activeChapter =
    getChapterForScene(activeSceneId) ?? HOME_PRIMARY_CHAPTERS[0];

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
      <div className='hero-glow pointer-events-none absolute inset-x-0 top-0 h-[42rem]' />

      <Container size='homepage'>
        <div className='mx-auto max-w-[1200px]'>
          <div className='homepage-hero-layout xl:grid xl:grid-cols-[minmax(0,34rem)_minmax(0,1fr)] xl:gap-14 2xl:gap-20'>
            <div className='min-w-0'>
              <div className='homepage-hero-stage flex min-h-[calc(100vh-var(--linear-header-height)-4.5rem)] flex-col justify-center pb-20 pt-6 md:pb-20 xl:min-h-[calc(100vh-var(--linear-header-height)-5.5rem)] xl:pb-24'>
                <HomeHeroCopy proofAvailability={proofAvailability} />
              </div>
            </div>

            <div className='relative hidden xl:flex xl:min-h-[calc(100vh-var(--linear-header-height)-5.5rem)] xl:items-center xl:justify-center'>
              <DesktopShowcase
                stage='hero'
                stateId={HOME_STORY_SCENES[0].showcaseState}
              />
            </div>
          </div>

          <div className='xl:hidden'>
            <div
              data-testid='homepage-mobile-phone-rail'
              className='homepage-mobile-phone-stage sticky top-[calc(var(--linear-header-height)+1rem)] z-10 mt-2'
            >
              <HomeProfileShowcase
                stateId={activeScene.showcaseState}
                compact
                className='homepage-showcase-mobile'
              />
            </div>

            <div
              className='mt-10 space-y-16 md:space-y-20'
              data-testid='homepage-mobile-story'
            >
              {HOME_PRIMARY_CHAPTERS.map(chapter => (
                <MobileChapter
                  key={chapter.id}
                  chapter={chapter}
                  activeSceneId={activeSceneId}
                  setSceneRef={setSceneRef}
                />
              ))}
            </div>
          </div>

          <div
            className='homepage-story-takeover-shell hidden xl:grid xl:grid-cols-[minmax(0,34rem)_minmax(0,1fr)] xl:gap-8 2xl:gap-14'
            data-active-chapter={activeChapter.id}
          >
            <div className='min-w-0'>
              <div
                className='space-y-4 pb-20'
                data-testid='homepage-desktop-story'
              >
                {HOME_PRIMARY_CHAPTERS.map(chapter => (
                  <DesktopChapter
                    key={chapter.id}
                    chapter={chapter}
                    activeSceneId={activeSceneId}
                    setSceneRef={setSceneRef}
                  />
                ))}
              </div>
            </div>

            <div className='relative'>
              <DesktopShowcase
                stage='story'
                stateId={activeScene.showcaseState}
              />
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
