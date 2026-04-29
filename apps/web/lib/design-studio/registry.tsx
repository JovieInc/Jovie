import {
  Disc3,
  Library,
  MessageSquare,
  Mic2,
  Music2,
  Search,
  Sparkles,
  UserCircle,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { AudioBar } from '@/components/shell/AudioBar';
import { DrawerHero } from '@/components/shell/DrawerHero';
import { LyricsView } from '@/components/shell/LyricsView';
import { StatusBadge } from '@/components/shell/StatusBadge';
import { ThreadAudioCard } from '@/components/shell/ThreadAudioCard';
import { ThreadImageCard } from '@/components/shell/ThreadImageCard';
import { ThreadVideoCard } from '@/components/shell/ThreadVideoCard';
import { TypeBadge } from '@/components/shell/TypeBadge';
import { MOCK_LYRICS } from '@/data/mock-lyrics';
import { SCREENSHOT_SCENARIOS } from '@/lib/screenshots/registry';
import { SECTION_REGISTRY, type SectionVariant } from '@/lib/sections/registry';
import { cn } from '@/lib/utils';

export type DesignStudioCategory =
  | 'pages'
  | 'sections'
  | 'music-ai'
  | 'shell-views'
  | 'components'
  | 'screenshots';

export interface DesignStudioItem {
  readonly id: string;
  readonly label: string;
  readonly category: DesignStudioCategory;
  readonly description: string;
  readonly preview: () => ReactNode;
  readonly demoRoute: string;
  readonly componentPaths: readonly string[];
  readonly screenshotScenarioIds: readonly string[];
  readonly marketingPrompt: string;
}

export const DESIGN_STUDIO_CATEGORY_LABELS: Record<
  DesignStudioCategory,
  string
> = {
  pages: 'Pages',
  sections: 'Sections',
  'music-ai': 'Music AI',
  'shell-views': 'Shell Views',
  components: 'Components',
  screenshots: 'Screenshots',
};

const COMMAND_ROWS = [
  {
    icon: UserCircle,
    title: 'Sora Vale',
    meta: 'Artist · 1.2M monthly listeners',
  },
  {
    icon: Music2,
    title: 'Midnight Static',
    meta: 'Track · Deep End',
  },
  {
    icon: Disc3,
    title: 'Deep End',
    meta: 'Release · Scheduled Apr 30',
  },
  {
    icon: Sparkles,
    title: 'Pitch this track',
    meta: 'Skill · Uses artist and track context',
  },
] as const;

const LIBRARY_ASSETS = [
  {
    title: 'Deep End Visualizer',
    type: '9:16 Video',
    status: 'Approved',
    tone: 'from-cyan-400/40 via-fuchsia-400/30 to-black',
  },
  {
    title: 'Midnight Static Cover',
    type: 'Artwork',
    status: 'Review',
    tone: 'from-emerald-300/35 via-sky-400/20 to-black',
  },
  {
    title: 'Tour Story Pack',
    type: 'Stories',
    status: 'Ready',
    tone: 'from-amber-300/35 via-rose-400/25 to-black',
  },
] as const;

function StudioFrame({
  children,
  className,
}: Readonly<{ children: ReactNode; className?: string }>) {
  return (
    <div
      className={cn(
        'min-h-[360px] overflow-hidden rounded-lg border border-white/10 bg-[#0d0e11] text-white shadow-[0_24px_80px_rgba(0,0,0,0.35)]',
        className
      )}
    >
      {children}
    </div>
  );
}

function MockArtwork({
  className,
}: Readonly<{
  className?: string;
}>) {
  return (
    <div
      className={cn(
        'grid place-items-center rounded-lg bg-[radial-gradient(circle_at_30%_20%,rgba(125,211,252,0.55),transparent_28%),linear-gradient(135deg,rgba(217,70,239,0.45),rgba(15,23,42,0.9)_58%,rgba(0,0,0,0.95))]',
        className
      )}
      aria-hidden='true'
    >
      <Music2 className='h-6 w-6 text-white/70' />
    </div>
  );
}

function MusicAiCommandPreview() {
  return (
    <StudioFrame className='grid grid-cols-[178px_1fr]'>
      <aside className='border-r border-white/10 bg-black/35 p-3'>
        <div className='mb-5 flex items-center gap-2'>
          <div className='grid h-7 w-7 place-items-center rounded-md bg-white text-black'>
            <Sparkles className='h-3.5 w-3.5' />
          </div>
          <div className='min-w-0'>
            <p className='truncate text-[12px] font-semibold'>Jovie</p>
            <p className='truncate text-[10px] text-white/45'>Music first AI</p>
          </div>
        </div>
        <nav className='space-y-1 text-[12px]'>
          {[
            ['Chat', MessageSquare],
            ['Library', Library],
            ['Releases', Disc3],
            ['Lyrics', Mic2],
          ].map(([label, Icon]) => (
            <div
              key={label as string}
              className={cn(
                'flex items-center gap-2 rounded-md px-2 py-1.5 text-white/60',
                label === 'Chat' && 'bg-white/[0.06] text-white'
              )}
            >
              <Icon className='h-3.5 w-3.5' />
              <span>{label as string}</span>
            </div>
          ))}
        </nav>
      </aside>

      <main className='relative p-4'>
        <div className='mx-auto max-w-[520px] space-y-3 pt-4'>
          <div className='rounded-2xl border border-white/10 bg-white/[0.035] p-3'>
            <p className='text-[12px] text-white/60'>Sora Vale</p>
            <p className='mt-1 text-[14px] leading-6 text-white'>
              Find the right track, pull release context, and draft a pitch for
              playlist editors.
            </p>
          </div>
          <div className='ml-auto max-w-[420px] rounded-2xl bg-white px-3 py-2 text-[13px] text-black'>
            Search artist Sora Vale and track Midnight Static.
          </div>
        </div>

        <div className='absolute bottom-4 left-1/2 w-[520px] max-w-[calc(100%-2rem)] -translate-x-1/2 rounded-2xl border border-white/12 bg-[#15161b] p-2 shadow-2xl'>
          <div className='flex items-center gap-2 border-b border-white/10 px-2 py-2 text-[12px] text-white/50'>
            <Search className='h-3.5 w-3.5' />
            <span>/artist Sora Vale /track Midnight Static</span>
          </div>
          <div className='grid gap-1 p-1.5'>
            {COMMAND_ROWS.map((row, index) => {
              const Icon = row.icon;
              return (
                <div
                  key={row.title}
                  className={cn(
                    'flex items-center gap-2 rounded-lg px-2 py-2',
                    index === 1 ? 'bg-white/[0.07]' : 'bg-transparent'
                  )}
                >
                  <div className='grid h-8 w-8 place-items-center rounded-md bg-white/[0.07] text-white/70'>
                    <Icon className='h-4 w-4' />
                  </div>
                  <div className='min-w-0'>
                    <p className='truncate text-[13px] font-medium text-white'>
                      {row.title}
                    </p>
                    <p className='truncate text-[11px] text-white/45'>
                      {row.meta}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </main>
    </StudioFrame>
  );
}

function LyricsViewPreview() {
  return (
    <StudioFrame>
      <div className='h-[420px]'>
        <LyricsView
          track={{ title: 'Lost in the Light', artist: 'Sora Vale' }}
          durationSec={214}
          currentTimeSec={82}
          lines={MOCK_LYRICS}
          onSeek={() => undefined}
          timed
        />
      </div>
    </StudioFrame>
  );
}

function LibraryViewPreview() {
  return (
    <StudioFrame className='p-4'>
      <div className='mb-4 flex items-center justify-between gap-3'>
        <div>
          <p className='text-[18px] font-semibold tracking-[-0.01em]'>
            Library
          </p>
          <p className='mt-1 text-[12px] text-white/50'>
            Release-native assets, sorted for launch work.
          </p>
        </div>
        <div className='rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-[11px] text-white/55'>
          28 Assets
        </div>
      </div>
      <div className='grid gap-3 sm:grid-cols-3'>
        {LIBRARY_ASSETS.map(asset => (
          <article
            key={asset.title}
            className='overflow-hidden rounded-lg border border-white/10 bg-white/[0.035]'
          >
            <div className={cn('h-32 bg-gradient-to-br', asset.tone)} />
            <div className='space-y-2 p-3'>
              <p className='truncate text-[13px] font-medium'>{asset.title}</p>
              <div className='flex items-center justify-between gap-2 text-[11px] text-white/45'>
                <span>{asset.type}</span>
                <span>{asset.status}</span>
              </div>
            </div>
          </article>
        ))}
      </div>
    </StudioFrame>
  );
}

function TrackViewPreview() {
  return (
    <StudioFrame className='grid grid-cols-[1fr_360px]'>
      <div className='flex flex-col justify-between p-4'>
        <div>
          <div className='mb-4 flex items-center gap-2 text-[12px] text-white/45'>
            <Disc3 className='h-3.5 w-3.5' />
            <span>Track View</span>
          </div>
          <div className='space-y-2'>
            {['Midnight Static', 'Deep End', 'Glass Floors'].map(
              (title, index) => (
                <div
                  key={title}
                  className={cn(
                    'grid grid-cols-[42px_1fr_auto] items-center gap-3 rounded-lg border border-white/10 px-3 py-2',
                    index === 0 ? 'bg-white/[0.06]' : 'bg-white/[0.025]'
                  )}
                >
                  <MockArtwork className='h-10 w-10' />
                  <div className='min-w-0'>
                    <p className='truncate text-[13px] font-medium'>{title}</p>
                    <p className='truncate text-[11px] text-white/45'>
                      Sora Vale · 3:{index === 0 ? '42' : '18'}
                    </p>
                  </div>
                  <span className='text-[11px] text-white/40'>
                    {index === 0 ? 'Playing' : 'Ready'}
                  </span>
                </div>
              )
            )}
          </div>
        </div>
        <AudioBar
          isPlaying
          onPlay={() => undefined}
          currentTime={84}
          duration={222}
          loopMode='track'
          onCycleLoop={() => undefined}
          waveformOn
          onToggleWaveform={() => undefined}
          lyricsActive={false}
          onOpenLyrics={() => undefined}
          track={{
            id: 'midnight-static',
            title: 'Midnight Static',
            artist: 'Sora Vale',
            hasLyrics: true,
          }}
        />
      </div>
      <aside className='border-l border-white/10 bg-black/25'>
        <DrawerHero
          title='Midnight Static'
          subtitle='Sora Vale · Deep End'
          artwork={<MockArtwork className='h-[88px] w-[88px]' />}
          statusBadge={<StatusBadge status='scheduled' />}
          meta={
            <>
              <TypeBadge label='Track' />
              <span className='rounded border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-[10px] text-white/50'>
                ISRC USJV12600102
              </span>
            </>
          }
          onPlay={() => undefined}
        />
        <div className='space-y-3 border-t border-white/10 p-3 text-[12px]'>
          {[
            ['DSP Links', 'Spotify, Apple Music, YouTube'],
            ['Lyrics', 'Synced and Apple Music ready'],
            ['Pitch Notes', 'Dark pop, late-night driving'],
          ].map(([label, value]) => (
            <div key={label}>
              <p className='text-white/45'>{label}</p>
              <p className='mt-1 text-white/80'>{value}</p>
            </div>
          ))}
        </div>
      </aside>
    </StudioFrame>
  );
}

function ThreadMediaPreview() {
  return (
    <StudioFrame className='p-4'>
      <div className='mb-4 flex items-center justify-between'>
        <div>
          <p className='text-[16px] font-semibold'>Thread Media Cards</p>
          <p className='mt-1 text-[12px] text-white/45'>
            Release context with audio, image, and video attachments.
          </p>
        </div>
        <MessageSquare className='h-4 w-4 text-white/40' />
      </div>
      <div className='grid gap-3 lg:grid-cols-3'>
        <ThreadAudioCard
          title='Midnight Static Preview'
          artist='Sora Vale'
          duration='3:42'
          onPlay={() => undefined}
        />
        <ThreadImageCard
          status='generating'
          prompt='Chrome-dipped cover art for a late-night synth track'
        />
        <ThreadVideoCard
          title='Visualizer Cut'
          durationSec={16}
          onPlay={() => undefined}
        />
      </div>
    </StudioFrame>
  );
}

function AudioBarPreview() {
  return (
    <StudioFrame className='flex min-h-[220px] items-end p-4'>
      <AudioBar
        isPlaying
        onPlay={() => undefined}
        onShuffle={() => undefined}
        onPrevious={() => undefined}
        onNext={() => undefined}
        currentTime={96}
        duration={224}
        loopMode='section'
        onCycleLoop={() => undefined}
        loopSection={{ from: 32, to: 58 }}
        waveformOn
        onToggleWaveform={() => undefined}
        lyricsActive
        onOpenLyrics={() => undefined}
        onCollapse={() => undefined}
        track={{
          id: 'deep-end',
          title: 'Deep End',
          artist: 'Sora Vale',
          hasLyrics: true,
        }}
      />
    </StudioFrame>
  );
}

function SectionPreview({ variant }: Readonly<{ variant: SectionVariant }>) {
  return (
    <div className='max-h-[360px] overflow-hidden rounded-lg border border-white/10 bg-(--linear-app-content-surface)'>
      {variant.render()}
    </div>
  );
}

function PublicProfileBoardPreview() {
  const states = [
    ['Mobile', 'Base, short, and tall capture gates'],
    ['Events', 'Present, nearby, and absent states'],
    ['Latest', 'Tour, presave, release, and fallback cards'],
    ['Alerts', 'Signup and preferences states'],
  ] as const;

  return (
    <StudioFrame className='p-4'>
      <div className='grid h-full gap-3 sm:grid-cols-2'>
        {states.map(([title, body]) => (
          <div
            key={title}
            className='rounded-lg border border-white/10 bg-white/[0.045] p-4'
          >
            <div className='mb-4 flex items-center gap-2'>
              <div className='grid h-8 w-8 place-items-center rounded-md bg-white text-black'>
                <UserCircle className='h-4 w-4' />
              </div>
              <p className='text-[13px] font-semibold text-white'>{title}</p>
            </div>
            <p className='text-[12px] leading-5 text-white/58'>{body}</p>
          </div>
        ))}
      </div>
    </StudioFrame>
  );
}

function sectionPrompt(variant: SectionVariant): string {
  return `Use the ${variant.label} landing-page section from ${variant.componentPath}. Place it on a Jovie marketing page where ${variant.description.toLowerCase()} Keep the composition compact and reuse the existing section component instead of rebuilding the layout.`;
}

const PRODUCT_SHOWCASE_ITEMS: readonly DesignStudioItem[] = [
  {
    id: 'public-profile-state-board',
    label: 'Public Profile State Board',
    category: 'pages',
    description:
      'Canonical public profile screenshot board covering responsive layout, event availability, smart cards, alerts, and sparse data.',
    preview: PublicProfileBoardPreview,
    demoRoute: '/demo/showcase/public-profile',
    componentPaths: [
      'apps/web/app/[username]/page.tsx',
      'apps/web/components/features/profile/StaticArtistPage.tsx',
      'apps/web/components/features/profile/templates/ProfileCompactTemplate.tsx',
      'apps/web/components/features/profile/templates/ProfileCompactSurface.tsx',
      'apps/web/components/features/profile/templates/ProfileDesktopSurface.tsx',
      'apps/web/components/features/profile/profile-surface-state.ts',
    ],
    screenshotScenarioIds: [
      'public-profile-desktop',
      'public-profile-tablet',
      'public-profile-mobile',
      'public-profile-mobile-short',
      'public-profile-mobile-tall',
      'public-profile-nearby-tour-mobile',
      'public-profile-presave-mobile',
      'tim-white-profile-live-mobile',
      'public-profile-playlist-fallback-mobile',
      'public-profile-listen-fallback-mobile',
      'tim-white-profile-subscribe-mobile',
      'public-profile-alerts-on-preferences-mobile',
      'public-profile-events-absent-desktop',
      'public-profile-events-absent-tablet',
      'public-profile-events-absent-mobile',
    ],
    marketingPrompt:
      'Use the canonical Jovie public profile state board when reviewing or presenting the production artist profile. Treat these screenshots as the approval set for responsive layout, smart cards, alerts, and empty-data behavior.',
  },
  {
    id: 'music-ai-command-surface',
    label: 'Music AI Command Surface',
    category: 'music-ai',
    description:
      'Left rail, chat composer, and command palette showing artist and track search as one music-first AI workflow.',
    preview: MusicAiCommandPreview,
    demoRoute: '/demo/showcase/music-ai-command',
    componentPaths: [
      'apps/web/components/jovie/components/ChatInput.tsx',
      'apps/web/components/jovie/components/SlashCommandMenu.tsx',
      'apps/web/components/organisms/SharedCommandPalette.tsx',
      'apps/web/components/jovie/components/picker-rows.tsx',
    ],
    screenshotScenarioIds: ['design-studio-music-ai-command-desktop'],
    marketingPrompt:
      'Feature the Jovie music-first AI command surface in a marketing page hero or product proof section. Show the left rail, chat composer, command palette, artist search, and track search together so it reads as an AI interface built around music context rather than a generic chatbot.',
  },
  {
    id: 'lyrics-view',
    label: 'Lyrics View',
    category: 'shell-views',
    description:
      'Cinematic timed lyrics surface with artist breadcrumb, playhead, and edit-ready line structure.',
    preview: LyricsViewPreview,
    demoRoute: '/demo/showcase/shell-lyrics',
    componentPaths: [
      'apps/web/components/shell/LyricsView.tsx',
      'apps/web/components/shell/LyricsHeader.tsx',
      'apps/web/components/shell/LyricsTimeline.tsx',
      'apps/web/components/shell/LyricRow.tsx',
    ],
    screenshotScenarioIds: ['design-studio-shell-lyrics-desktop'],
    marketingPrompt:
      'Use the Jovie Lyrics View as a full-bleed product screenshot or feature proof. Emphasize the timed lyric rows, playhead, and artist-to-track context to show that Jovie understands actual music workflows.',
  },
  {
    id: 'library-view',
    label: 'Library View',
    category: 'shell-views',
    description:
      'Release-native asset library for artwork, vertical video, review states, and launch-ready creative.',
    preview: LibraryViewPreview,
    demoRoute: '/demo/showcase/shell-library',
    componentPaths: [
      'apps/web/app/app/(shell)/dashboard/library/LibrarySurface.tsx',
      'apps/web/app/exp/library-v1/page.tsx',
    ],
    screenshotScenarioIds: ['design-studio-shell-library-desktop'],
    marketingPrompt:
      'Place the Jovie Library View in a product section about organizing release assets. Show approved artwork, story packs, and review states in a dense, premium grid rather than a generic file browser.',
  },
  {
    id: 'track-view',
    label: 'Track View',
    category: 'shell-views',
    description:
      'Track-focused workspace with audio bar, release drawer, lyrics status, and provider context.',
    preview: TrackViewPreview,
    demoRoute: '/demo/showcase/shell-track',
    componentPaths: [
      'apps/web/components/shell/DrawerHero.tsx',
      'apps/web/components/shell/AudioBar.tsx',
      'apps/web/components/features/dashboard/organisms/release-provider-matrix/components/TrackRow.tsx',
      'apps/web/app/exp/shell-v1/page.tsx',
    ],
    screenshotScenarioIds: ['design-studio-shell-track-desktop'],
    marketingPrompt:
      'Use the Jovie Track View to show a music-specific workspace: track list, drawer metadata, lyrics readiness, DSP links, and persistent audio controls. This should feel like product proof for artists and teams, not a generic admin table.',
  },
  {
    id: 'audio-bar',
    label: 'Audio Bar',
    category: 'components',
    description:
      'Persistent bottom player with transport controls, waveform, loop state, and lyrics toggle.',
    preview: AudioBarPreview,
    demoRoute: '/demo/showcase/shell-track',
    componentPaths: [
      'apps/web/components/shell/AudioBar.tsx',
      'apps/web/components/shell/ScrubGradient.tsx',
      'apps/web/components/shell/LoopBtn.tsx',
    ],
    screenshotScenarioIds: ['design-studio-shell-track-desktop'],
    marketingPrompt:
      'Use the Jovie Audio Bar as a close product detail when the page needs to prove music-native interaction. Highlight waveform scrubbing, loop controls, and the lyrics toggle.',
  },
  {
    id: 'thread-media-cards',
    label: 'Thread Media Cards',
    category: 'components',
    description:
      'Chat thread media cards for audio, artwork, and visualizer context inside the AI workflow.',
    preview: ThreadMediaPreview,
    demoRoute: '/demo/showcase/music-ai-command',
    componentPaths: [
      'apps/web/components/shell/ThreadAudioCard.tsx',
      'apps/web/components/shell/ThreadImageCard.tsx',
      'apps/web/components/shell/ThreadVideoCard.tsx',
    ],
    screenshotScenarioIds: ['design-studio-music-ai-command-desktop'],
    marketingPrompt:
      'Use Jovie thread media cards to show the assistant working with real release assets. Pair audio, cover direction, and visualizer cards so the workflow feels grounded in music deliverables.',
  },
];

const SECTION_SHOWCASE_ITEMS: readonly DesignStudioItem[] =
  SECTION_REGISTRY.map(variant => ({
    id: `section-${variant.id}`,
    label: variant.label,
    category: 'sections' as const,
    description: variant.description,
    preview: () => <SectionPreview variant={variant} />,
    demoRoute: `/exp/component-checker?id=${encodeURIComponent(variant.id)}`,
    componentPaths: [variant.componentPath],
    screenshotScenarioIds: [],
    marketingPrompt: sectionPrompt(variant),
  }));

export const DESIGN_STUDIO_ITEMS: readonly DesignStudioItem[] = [
  ...PRODUCT_SHOWCASE_ITEMS,
  ...SECTION_SHOWCASE_ITEMS,
];

export const DESIGN_STUDIO_SCREENSHOT_IDS = new Set(
  DESIGN_STUDIO_ITEMS.flatMap(item => item.screenshotScenarioIds)
);

export const DESIGN_STUDIO_SCREENSHOT_SCENARIOS = SCREENSHOT_SCENARIOS.filter(
  scenario => DESIGN_STUDIO_SCREENSHOT_IDS.has(scenario.id)
);

export function getDesignStudioItem(id: string): DesignStudioItem | undefined {
  return DESIGN_STUDIO_ITEMS.find(item => item.id === id);
}

export function getDesignStudioItemsByCategory(
  category: DesignStudioCategory
): readonly DesignStudioItem[] {
  return DESIGN_STUDIO_ITEMS.filter(item => item.category === category);
}

export function getDesignStudioScreenshotUrl(scenarioId: string): string {
  return `/api/admin/screenshots/${encodeURIComponent(scenarioId)}`;
}

export function getDesignStudioPublicScreenshotUrl(
  scenarioId: string
): string | null {
  const scenario = SCREENSHOT_SCENARIOS.find(item => item.id === scenarioId);
  if (!scenario?.publicExportPath) return null;
  return `/product-screenshots/${scenario.publicExportPath}`;
}
