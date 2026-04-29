'use client';

import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  ArrowDown,
  ArrowUp,
  Check,
  Copy,
  GripVertical,
  Image as ImageIcon,
  Layers,
  LayoutTemplate,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Upload,
  UserRound,
  X,
} from 'lucide-react';
import NextImage from 'next/image';
import {
  type ChangeEvent,
  type DragEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { HomeTrustSection } from '@/components/features/home/HomeTrustSection';
import { HomepageOutcomeCards } from '@/components/homepage/HomepageOutcomeCards';
import { ArtistNotificationsBenefitsSection } from '@/components/marketing/artist-notifications/ArtistNotificationsBenefitsSection';
import { ArtistNotificationsHero } from '@/components/marketing/artist-notifications/ArtistNotificationsHero';
import {
  ArtistProfileAdaptiveSequence,
  ArtistProfileFaq,
  ArtistProfileHero,
  ArtistProfileMonetizationSection,
  ArtistProfileSpecWall,
} from '@/components/marketing/artist-profile';
import {
  HomepageV2CaptureReactivate,
  HomepageV2FinalCta,
  HomepageV2Hero,
  HomepageV2Pricing,
  HomepageV2Spotlight,
  HomepageV2SystemOverview,
} from '@/components/marketing/homepage-v2/HomepageSections';
import { ARTIST_NOTIFICATIONS_COPY } from '@/data/artistNotificationsCopy';
import { ARTIST_PROFILE_COPY } from '@/data/artistProfileCopy';
import { ARTIST_PROFILE_SPEC_TILES } from '@/data/artistProfileFeatures';
import type {
  MarketingSectionEntry,
  MarketingSectionFamily,
  MarketingSectionStatus,
} from '@/data/marketingSectionRegistry';
import { DemoClientProviders } from '@/features/demo/DemoClientProviders';
import { HomeProfileShowcase } from '@/features/home/HomeProfileShowcase';
import {
  HOMEPAGE_PROFILE_PREVIEW_ARTIST,
  HOMEPAGE_PROFILE_PREVIEW_CONTACTS,
  HOMEPAGE_PROFILE_PREVIEW_DRAWER_RELEASES,
  HOMEPAGE_PROFILE_PREVIEW_RELEASES,
  HOMEPAGE_PROFILE_PREVIEW_SOCIAL_LINKS,
  HOMEPAGE_PROFILE_PREVIEW_TOUR_DATES,
  HOMEPAGE_PROFILE_SHOWCASE_STATES,
} from '@/features/home/homepage-profile-preview-fixture';
import {
  PROFILE_MODE_KEYS,
  type ProfileMode,
  type ProfileShowcaseStateId,
} from '@/features/profile/contracts';
import {
  StaticArtistPage,
  type StaticArtistPageProps,
} from '@/features/profile/StaticArtistPage';
import {
  addSectionToPageDraft,
  buildMarketingPageLayoutCopy,
  buildMarketingPageLayoutPrompt,
  createMarketingLayoutDraft,
  getMarketingDraftSections,
  getMarketingPageDraft,
  type MarketingLayoutDraft,
  moveSectionBefore,
  moveSectionByOffset,
  moveSectionInPageDraft,
  parseMarketingLayoutDraft,
  removeSectionFromPageDraft,
} from '@/lib/marketing/section-builder';
import {
  buildMarketingSectionImplementationPrompt,
  buildMarketingSectionRemixPrompt,
  MARKETING_REMIX_ASPECT_RATIOS,
  type MarketingRemixAspectRatio,
} from '@/lib/marketing/section-remix';
import { cn } from '@/lib/utils';

type FilterValue = 'All';
type RemixStatus =
  | 'generating'
  | 'prompt-ready'
  | 'ready'
  | 'approved'
  | 'rejected'
  | 'error';
type StudioTab = 'landing-pages' | 'profiles';
type StudioPreviewMode = 'static' | 'live';
type StudioViewport = 'desktop' | 'tablet' | 'mobile';
type StudioZoom = 0.5 | 0.75 | 1;
type StudioLatestRelease = NonNullable<StaticArtistPageProps['latestRelease']>;
type StudioReleaseSeed = {
  readonly title: string;
  readonly slug: string;
  readonly artworkUrl: string | null;
  readonly releaseDate: string;
  readonly revealDate?: string;
  readonly releaseType: string;
  readonly metadata?: Record<string, unknown>;
};
type DesignArtifactSource = 'pasted' | 'uploaded' | 'dropped';

interface DesignArtifact {
  readonly id: string;
  readonly title: string;
  readonly imageUrl: string;
  readonly width: number;
  readonly height: number;
  readonly source: DesignArtifactSource;
  readonly createdAt: string;
}

interface DesignArtifactStore {
  readonly version: number;
  readonly artifacts: readonly DesignArtifact[];
}

interface StudioTabItem {
  readonly id: StudioTab;
  readonly label: string;
  readonly description: string;
  readonly icon: typeof LayoutTemplate;
}

type BuilderDragData =
  | {
      readonly type: 'library-section';
      readonly sectionId: string;
    }
  | {
      readonly type: 'page-section';
      readonly page: string;
      readonly sectionId: string;
    }
  | {
      readonly type: 'page-drop';
      readonly page: string;
    };

interface SectionRemixState {
  readonly status: RemixStatus;
  readonly prompt: string;
  readonly aspectRatio: MarketingRemixAspectRatio;
  readonly includeDesignGuidance: boolean;
  readonly imageUrl?: string;
  readonly error?: string;
}

interface MarketingSectionsLabClientProps {
  readonly sections: readonly MarketingSectionEntry[];
  readonly pages: readonly string[];
  readonly families: readonly MarketingSectionFamily[];
  readonly statuses: readonly MarketingSectionStatus[];
}

const ALL: FilterValue = 'All';
const BUILDER_DRAFT_STORAGE_KEY = 'jovie:exp:design-studio-builder:v2';
const DESIGN_ARTIFACT_STORAGE_KEY = 'jovie:exp:design-studio-artifacts:v1';
const DESIGN_ARTIFACT_STORE_VERSION = 1;
const DESIGN_ARTIFACT_SECTION_PREFIX = 'artifact:';
const MAX_DESIGN_ARTIFACTS = 24;
const MAX_ARTIFACT_EDGE = 1400;
const ARTIFACT_IMAGE_QUALITY = 0.86;
const STUDIO_VIEWPORT_WIDTHS: Record<StudioViewport, number> = {
  desktop: 832,
  tablet: 640,
  mobile: 390,
};
const STUDIO_ZOOM_OPTIONS: readonly StudioZoom[] = [0.5, 0.75, 1];
const STUDIO_TABS: readonly StudioTabItem[] = [
  {
    id: 'landing-pages',
    label: 'Landing Pages',
    description: 'Compose marketing page sections.',
    icon: LayoutTemplate,
  },
  {
    id: 'profiles',
    label: 'Public Profiles',
    description: 'Review public profile states.',
    icon: UserRound,
  },
] as const;
const SHOWCASE_PROFILE_SETTINGS = { showOldReleases: true } as const;
const PROFILE_MODE_TITLES: Record<ProfileMode, string> = {
  profile: 'Profile Home',
  listen: 'Listen Drawer',
  pay: 'Pay Drawer',
  subscribe: 'Subscribe Flow',
  about: 'About Drawer',
  contact: 'Contact Drawer',
  tour: 'Tour Drawer',
  releases: 'Releases Drawer',
};
const STUDIO_RELEASE_TIMESTAMP = new Date('2026-01-01T00:00:00.000Z');

function makeStudioLatestRelease(seed: StudioReleaseSeed): StudioLatestRelease {
  return {
    id: `design-studio-${seed.slug}`,
    creatorProfileId: 'design-studio-profile',
    title: seed.title,
    slug: seed.slug,
    releaseType: seed.releaseType,
    releaseDate: new Date(seed.releaseDate),
    status: 'released',
    revealDate: seed.revealDate ? new Date(seed.revealDate) : null,
    deletedAt: null,
    label: null,
    upc: null,
    totalTracks: 1,
    isExplicit: false,
    genres: HOMEPAGE_PROFILE_PREVIEW_ARTIST.genres ?? null,
    targetPlaylists: null,
    copyrightLine: null,
    distributor: null,
    artworkUrl: seed.artworkUrl,
    spotifyPopularity: null,
    sourceType: 'manual',
    metadata: seed.metadata ?? {},
    generatedPitches: null,
    createdAt: STUDIO_RELEASE_TIMESTAMP,
    updatedAt: STUDIO_RELEASE_TIMESTAMP,
  } as StudioLatestRelease;
}

const PROFILE_LATEST_RELEASES = {
  live: makeStudioLatestRelease(HOMEPAGE_PROFILE_PREVIEW_RELEASES.live),
  presave: makeStudioLatestRelease(HOMEPAGE_PROFILE_PREVIEW_RELEASES.presave),
  video: makeStudioLatestRelease({
    title: 'Never Say a Word',
    slug: 'never-say-a-word',
    artworkUrl: '/img/releases/never-say-a-word.jpg',
    releaseDate: '2025-08-15T07:00:00.000Z',
    releaseType: 'music_video',
  }),
} as const;
const PROFILE_RELEASE_REVIEW_ITEMS: readonly {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly latestRelease: StudioLatestRelease;
}[] = [
  {
    id: 'live',
    title: 'Live Release',
    description: 'Released music leads the profile action card.',
    latestRelease: PROFILE_LATEST_RELEASES.live,
  },
  {
    id: 'presave',
    title: 'Presave Countdown',
    description: 'Upcoming music keeps the countdown state visible.',
    latestRelease: PROFILE_LATEST_RELEASES.presave,
  },
  {
    id: 'video',
    title: 'Video Release',
    description: 'Music video metadata keeps the media CTA in view.',
    latestRelease: PROFILE_LATEST_RELEASES.video,
  },
] as const;
const PROFILE_DEEP_STATE_IDS: readonly ProfileShowcaseStateId[] = [
  'mock-home',
  'streams-latest',
  'streams-presave',
  'streams-release-day',
  'streams-video',
  'tour-nearby',
  'playlist-fallback',
  'listen-fallback',
  'fans-opt-in',
  'fans-confirmed',
  'fans-song-alert',
  'fans-show-alert',
  'subscribe-email',
  'subscribe-otp',
  'subscribe-otp-error',
  'subscribe-name',
  'subscribe-birthday',
  'subscribe-done',
  'tips-open',
  'tips-apple-pay',
  'tips-thank-you',
  'tips-followup',
  'tour',
  'contact',
  'catalog',
];

function getStudioTabFromLocation(): StudioTab {
  if (globalThis.window === undefined) {
    return 'landing-pages';
  }

  return new URLSearchParams(globalThis.location.search).get('tab') ===
    'profiles'
    ? 'profiles'
    : 'landing-pages';
}

function formatProfileStateLabel(stateId: ProfileShowcaseStateId): string {
  return stateId
    .replaceAll('-', ' ')
    .replaceAll(/\b\w/g, character => character.toUpperCase());
}

function getArtifactSectionId(artifactId: string): string {
  return `${DESIGN_ARTIFACT_SECTION_PREFIX}${artifactId}`;
}

function isArtifactSectionId(sectionId: string): boolean {
  return sectionId.startsWith(DESIGN_ARTIFACT_SECTION_PREFIX);
}

function createDesignArtifactId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

function createDesignArtifactTitle(file: File, index: number): string {
  const cleanName = file.name
    .replace(/\.[^.]+$/, '')
    .replaceAll(/[-_]+/g, ' ')
    .trim();

  return cleanName
    ? cleanName.replaceAll(/\b\w/g, character => character.toUpperCase())
    : `Design Reference ${index + 1}`;
}

function formatArtifactSource(source: DesignArtifactSource): string {
  return source.replaceAll(/\b\w/g, character => character.toUpperCase());
}

function createArtifactSection(
  artifact: DesignArtifact
): MarketingSectionEntry {
  return {
    id: getArtifactSectionId(artifact.id),
    label: artifact.title,
    family: 'System',
    status: 'Candidate',
    currentPages: [],
    candidatePages: [],
    testId: undefined,
    copyVariants: [
      {
        id: 'reference',
        label: 'Reference',
        headline: artifact.title,
        body: 'Local image reference for a page section.',
      },
    ],
    preview: {
      kind: 'poster',
      headline: artifact.title,
      body: 'Pasted design reference. Attach this image with the copied build prompt.',
      chips: ['Image Reference', formatArtifactSource(artifact.source)],
    },
  };
}

function createArtifactSections(
  artifacts: readonly DesignArtifact[]
): MarketingSectionEntry[] {
  return artifacts.map(createArtifactSection);
}

function parseDesignArtifacts(raw: string | null): DesignArtifact[] {
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as Partial<DesignArtifactStore>;

    if (
      parsed.version !== DESIGN_ARTIFACT_STORE_VERSION ||
      !Array.isArray(parsed.artifacts)
    ) {
      return [];
    }

    return parsed.artifacts
      .filter(
        (artifact): artifact is DesignArtifact =>
          typeof artifact?.id === 'string' &&
          typeof artifact.title === 'string' &&
          typeof artifact.imageUrl === 'string' &&
          typeof artifact.width === 'number' &&
          typeof artifact.height === 'number' &&
          typeof artifact.createdAt === 'string' &&
          (artifact.source === 'pasted' ||
            artifact.source === 'uploaded' ||
            artifact.source === 'dropped')
      )
      .slice(0, MAX_DESIGN_ARTIFACTS);
  } catch {
    return [];
  }
}

function getImageFilesFromFileList(files: FileList | null): File[] {
  return Array.from(files ?? []).filter(file => file.type.startsWith('image/'));
}

function getImageFilesFromDataTransfer(
  dataTransfer: DataTransfer | null
): File[] {
  if (!dataTransfer) {
    return [];
  }

  const itemFiles = Array.from(dataTransfer.items ?? [])
    .filter(item => item.kind === 'file')
    .map(item => item.getAsFile())
    .filter((file): file is File => !!file && file.type.startsWith('image/'));

  return itemFiles.length > 0
    ? itemFiles
    : getImageFilesFromFileList(dataTransfer.files);
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () =>
      reject(reader.error ?? new Error('File read failed.'));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Image decode failed.'));
    image.src = src;
  });
}

async function createCompressedImageArtifact(
  file: File,
  source: DesignArtifactSource,
  index: number
): Promise<DesignArtifact> {
  const sourceDataUrl = await readFileAsDataUrl(file);
  const image = await loadImage(sourceDataUrl);
  const scale = Math.min(
    1,
    MAX_ARTIFACT_EDGE / Math.max(image.naturalWidth, image.naturalHeight)
  );
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');

  if (!context) {
    return {
      id: createDesignArtifactId(),
      title: createDesignArtifactTitle(file, index),
      imageUrl: sourceDataUrl,
      width: image.naturalWidth,
      height: image.naturalHeight,
      source,
      createdAt: new Date().toISOString(),
    };
  }

  context.fillStyle = '#050608';
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);

  return {
    id: createDesignArtifactId(),
    title: createDesignArtifactTitle(file, index),
    imageUrl: canvas.toDataURL('image/jpeg', ARTIFACT_IMAGE_QUALITY),
    width,
    height,
    source,
    createdAt: new Date().toISOString(),
  };
}

function includesText(section: MarketingSectionEntry, query: string): boolean {
  const haystack = [
    section.id,
    section.label,
    section.family,
    section.status,
    ...section.currentPages,
    ...section.candidatePages,
    ...section.copyVariants.flatMap(variant => [
      variant.label,
      variant.headline,
      variant.body ?? '',
    ]),
  ]
    .join(' ')
    .toLowerCase();

  return haystack.includes(query.toLowerCase());
}

function getCopyVariantOptions(sections: readonly MarketingSectionEntry[]) {
  return Array.from(
    new Set(
      sections.flatMap(section =>
        section.copyVariants.map(variant => variant.label)
      )
    )
  ).sort((a, b) => a.localeCompare(b));
}

function getPageDropId(page: string): string {
  return `builder-page:${page}`;
}

function getPageSectionDragId(page: string, sectionId: string): string {
  return `builder-page-section:${page}:${sectionId}`;
}

function getLibraryDragId(sectionId: string): string {
  return `builder-library-section:${sectionId}`;
}

function getSectionDomId(page: string, sectionId: string): string {
  return `section-${page.replace(/[^a-z0-9-]/gi, '-')}-${sectionId.replace(
    /[^a-z0-9-]/gi,
    '-'
  )}`;
}

function getInitialActivePage(pages: readonly string[]): string {
  return pages.includes('Homepage') ? 'Homepage' : (pages[0] ?? '');
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.name === 'AbortError') {
    return 'Clipboard request timed out.';
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'Clipboard permission is unavailable.';
}

function getDragData(data: unknown): BuilderDragData | null {
  if (!data || typeof data !== 'object' || !('type' in data)) {
    return null;
  }

  return data as BuilderDragData;
}

function getDropTargetPage(data: BuilderDragData | null): string | null {
  if (!data) {
    return null;
  }

  return data.type === 'page-drop' || data.type === 'page-section'
    ? data.page
    : null;
}

async function writeTextToClipboard(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
}

async function writeMockupToClipboard(
  imageUrl: string | undefined
): Promise<void> {
  if (!imageUrl) {
    throw new Error('No generated mockup is available.');
  }

  const ClipboardItemConstructor = globalThis.ClipboardItem;

  if (
    !ClipboardItemConstructor ||
    typeof navigator.clipboard.write !== 'function'
  ) {
    throw new Error('Image clipboard writes are not available.');
  }

  const imageResponse = await fetch(imageUrl);
  const imageBlob = await imageResponse.blob();
  const imageType = imageBlob.type || 'image/jpeg';

  await navigator.clipboard.write([
    new ClipboardItemConstructor({
      [imageType]: imageBlob,
    }),
  ]);
}

function getLiveSection(sectionId: string): ReactNode | null {
  switch (sectionId) {
    case 'homepage.hero':
      return <HomepageV2Hero />;
    case 'homepage.trust':
      return (
        <div className='py-12'>
          <HomeTrustSection />
        </div>
      );
    case 'homepage.outcomes':
      return (
        <HomepageOutcomeCards
          headline={ARTIST_PROFILE_COPY.outcomeDuo.homepageHeadline}
          outcomes={ARTIST_PROFILE_COPY.outcomes}
        />
      );
    case 'homepage.pricing':
    case 'pricing.main':
      return <HomepageV2Pricing />;
    case 'homepage.final-cta':
      return <HomepageV2FinalCta />;
    case 'homepage.system-overview':
      return <HomepageV2SystemOverview />;
    case 'homepage.spotlight':
      return <HomepageV2Spotlight />;
    case 'homepage.capture-reactivate':
      return <HomepageV2CaptureReactivate />;
    case 'artist-profile.hero':
      return <ArtistProfileHero hero={ARTIST_PROFILE_COPY.hero} />;
    case 'artist-profile.adaptive':
      return (
        <div className='pt-32'>
          <ArtistProfileAdaptiveSequence
            adaptive={ARTIST_PROFILE_COPY.adaptive}
            phoneCaption={ARTIST_PROFILE_COPY.hero.phoneCaption}
            phoneSubcaption={ARTIST_PROFILE_COPY.hero.phoneSubcaption}
          />
        </div>
      );
    case 'artist-profile.monetization':
      return (
        <ArtistProfileMonetizationSection
          monetization={ARTIST_PROFILE_COPY.monetization}
        />
      );
    case 'artist-profile.spec-wall':
      return (
        <ArtistProfileSpecWall
          specWall={ARTIST_PROFILE_COPY.specWall}
          tiles={ARTIST_PROFILE_SPEC_TILES}
        />
      );
    case 'notifications.hero':
      return <ArtistNotificationsHero hero={ARTIST_NOTIFICATIONS_COPY.hero} />;
    case 'notifications.benefits':
      return (
        <ArtistNotificationsBenefitsSection
          benefits={ARTIST_NOTIFICATIONS_COPY.benefits}
        />
      );
    case 'shared.faq':
      return <ArtistProfileFaq faq={ARTIST_PROFILE_COPY.faq} />;
    default:
      return null;
  }
}

export function MarketingSectionsLabClient({
  sections,
  pages,
  families,
  statuses,
}: Readonly<MarketingSectionsLabClientProps>) {
  const [activeStudioTab, setActiveStudioTab] =
    useState<StudioTab>('landing-pages');
  const [activePage, setActivePage] = useState(() =>
    getInitialActivePage(pages)
  );
  const [familyFilter, setFamilyFilter] = useState<string>(ALL);
  const [statusFilter, setStatusFilter] = useState<string>(ALL);
  const [copyFilter, setCopyFilter] = useState<string>(ALL);
  const [query, setQuery] = useState('');
  const [includeDesignGuidance, setIncludeDesignGuidance] = useState(true);
  const [previewMode, setPreviewMode] = useState<StudioPreviewMode>('static');
  const [viewport, setViewport] = useState<StudioViewport>('desktop');
  const [zoom, setZoom] = useState<StudioZoom>(0.75);
  const [showSectionChrome, setShowSectionChrome] = useState(true);
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(
    null
  );
  const [remixAspectRatio, setRemixAspectRatio] =
    useState<MarketingRemixAspectRatio>('16:9');
  const [mounted, setMounted] = useState(false);
  const [draftHydrated, setDraftHydrated] = useState(false);
  const [artifactsHydrated, setArtifactsHydrated] = useState(false);
  const [artifacts, setArtifacts] = useState<DesignArtifact[]>([]);
  const [artifactError, setArtifactError] = useState<string | null>(null);
  const [draft, setDraft] = useState<MarketingLayoutDraft>(() =>
    createMarketingLayoutDraft(sections, pages)
  );
  const [layoutCopyError, setLayoutCopyError] = useState<string | null>(null);
  const [copiedLayout, setCopiedLayout] = useState(false);
  const [copiedLayoutPrompt, setCopiedLayoutPrompt] = useState(false);
  const [remixes, setRemixes] = useState<
    Record<string, SectionRemixState | undefined>
  >({});
  const [copiedDesignPromptSectionId, setCopiedDesignPromptSectionId] =
    useState<string | null>(null);
  const [copiedBuildPromptSectionId, setCopiedBuildPromptSectionId] = useState<
    string | null
  >(null);
  const [copiedMockupSectionId, setCopiedMockupSectionId] = useState<
    string | null
  >(null);
  const pageColumnRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const artifactSections = useMemo(
    () => createArtifactSections(artifacts),
    [artifacts]
  );
  const allSections = useMemo(
    () => [...sections, ...artifactSections],
    [artifactSections, sections]
  );
  const artifactBySectionId = useMemo(
    () =>
      new Map(
        artifacts.map(artifact => [getArtifactSectionId(artifact.id), artifact])
      ),
    [artifacts]
  );
  const copyVariantOptions = useMemo(
    () => getCopyVariantOptions(allSections),
    [allSections]
  );
  const sectionsById = useMemo(
    () => new Map(allSections.map(section => [section.id, section])),
    [allSections]
  );
  const activePageSections = useMemo(
    () => getMarketingDraftSections(draft, activePage, allSections),
    [activePage, allSections, draft]
  );
  const filteredLibrarySections = useMemo(
    () =>
      allSections.filter(section => {
        const matchesFamily =
          familyFilter === ALL || section.family === familyFilter;
        const matchesStatus =
          statusFilter === ALL || section.status === statusFilter;
        const matchesCopy =
          copyFilter === ALL ||
          section.copyVariants.some(variant => variant.label === copyFilter);
        const matchesQuery = query.trim()
          ? includesText(section, query.trim())
          : true;

        return matchesFamily && matchesStatus && matchesCopy && matchesQuery;
      }),
    [allSections, copyFilter, familyFilter, query, statusFilter]
  );
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );
  const addDesignArtifactFiles = useCallback(
    async (
      files: readonly File[],
      source: DesignArtifactSource,
      targetPage?: string
    ) => {
      const imageFiles = files.filter(file => file.type.startsWith('image/'));

      if (imageFiles.length === 0) {
        return;
      }

      setArtifactError(null);

      try {
        const nextArtifacts = await Promise.all(
          imageFiles.map((file, index) =>
            createCompressedImageArtifact(file, source, index)
          )
        );

        setArtifacts(currentArtifacts =>
          [...nextArtifacts, ...currentArtifacts].slice(0, MAX_DESIGN_ARTIFACTS)
        );

        if (targetPage) {
          setActivePage(targetPage);
          setDraft(currentDraft =>
            nextArtifacts.reduce(
              (nextDraft, artifact) =>
                addSectionToPageDraft(
                  nextDraft,
                  targetPage,
                  getArtifactSectionId(artifact.id)
                ),
              currentDraft
            )
          );
          const lastArtifact = nextArtifacts[nextArtifacts.length - 1];
          if (lastArtifact) {
            setSelectedSectionId(getArtifactSectionId(lastArtifact.id));
          }
        }
      } catch {
        setArtifactError('That image could not be added.');
      }
    },
    []
  );

  useEffect(() => {
    setMounted(true);
    setActiveStudioTab(getStudioTabFromLocation());

    const handlePopState = () => {
      setActiveStudioTab(getStudioTabFromLocation());
    };

    globalThis.addEventListener('popstate', handlePopState);
    return () => globalThis.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    if (!pages.includes(activePage) && pages[0]) {
      setActivePage(pages[0]);
    }
  }, [activePage, pages]);

  useEffect(() => {
    if (globalThis.window === undefined) {
      return;
    }

    const storedArtifacts = parseDesignArtifacts(
      globalThis.localStorage.getItem(DESIGN_ARTIFACT_STORAGE_KEY)
    );
    const storedSections = [
      ...sections,
      ...createArtifactSections(storedArtifacts),
    ];
    const storedDraft = globalThis.localStorage.getItem(
      BUILDER_DRAFT_STORAGE_KEY
    );

    setArtifacts(storedArtifacts);
    setDraft(parseMarketingLayoutDraft(storedDraft, storedSections, pages));
    setArtifactsHydrated(true);
    setDraftHydrated(true);
  }, [pages, sections]);

  useEffect(() => {
    if (!draftHydrated || globalThis.window === undefined) {
      return;
    }

    try {
      globalThis.localStorage.setItem(
        BUILDER_DRAFT_STORAGE_KEY,
        JSON.stringify(draft)
      );
    } catch {
      // Local drafts are a convenience only; storage failure should not block use.
    }
  }, [draft, draftHydrated]);

  useEffect(() => {
    if (!artifactsHydrated || globalThis.window === undefined) {
      return;
    }

    try {
      const storedValue: DesignArtifactStore = {
        version: DESIGN_ARTIFACT_STORE_VERSION,
        artifacts,
      };
      globalThis.localStorage.setItem(
        DESIGN_ARTIFACT_STORAGE_KEY,
        JSON.stringify(storedValue)
      );
    } catch {
      setArtifactError('Local image storage is full. Remove a few references.');
    }
  }, [artifacts, artifactsHydrated]);

  useEffect(() => {
    if (activeStudioTab !== 'landing-pages') {
      return;
    }

    const handlePaste = (event: ClipboardEvent) => {
      const files = Array.from(event.clipboardData?.items ?? [])
        .filter(item => item.kind === 'file')
        .map(item => item.getAsFile())
        .filter(
          (file): file is File => !!file && file.type.startsWith('image/')
        );

      if (files.length === 0) {
        return;
      }

      event.preventDefault();
      void addDesignArtifactFiles(files, 'pasted', activePage);
    };

    globalThis.addEventListener('paste', handlePaste);
    return () => globalThis.removeEventListener('paste', handlePaste);
  }, [activePage, activeStudioTab, addDesignArtifactFiles]);

  const selectPage = (page: string) => {
    setActivePage(page);
    pageColumnRefs.current[page]?.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
      inline: 'start',
    });
  };

  const setPageColumnRef = (page: string, node: HTMLDivElement | null) => {
    pageColumnRefs.current[page] = node;
  };

  const selectStudioTab = (tab: StudioTab) => {
    setActiveStudioTab(tab);

    if (globalThis.window === undefined) {
      return;
    }

    const nextUrl = new URL(globalThis.location.href);
    if (tab === 'profiles') {
      nextUrl.searchParams.set('tab', 'profiles');
    } else {
      nextUrl.searchParams.delete('tab');
    }

    globalThis.history.replaceState(
      globalThis.history.state,
      '',
      `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`
    );
  };

  const resetActivePage = () => {
    const seedDraft = createMarketingLayoutDraft(sections, pages);
    const seedPage = getMarketingPageDraft(seedDraft, activePage);
    setDraft(currentDraft => ({
      ...currentDraft,
      pages: currentDraft.pages.map(pageDraft =>
        pageDraft.page === activePage ? seedPage : pageDraft
      ),
    }));
  };

  const resetAllDrafts = () => {
    setDraft(createMarketingLayoutDraft(sections, pages));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const activeData = getDragData(event.active.data.current);
    const overData = getDragData(event.over?.data.current);
    const targetPage = getDropTargetPage(overData);

    if (!activeData || !targetPage) {
      return;
    }

    setActivePage(targetPage);

    if (activeData.type === 'library-section') {
      setDraft(currentDraft => {
        const targetPageDraft = getMarketingPageDraft(currentDraft, targetPage);
        const targetIndex =
          overData?.type === 'page-section'
            ? targetPageDraft.sectionIds.indexOf(overData.sectionId)
            : undefined;

        return addSectionToPageDraft(
          currentDraft,
          targetPage,
          activeData.sectionId,
          targetIndex === -1 ? undefined : targetIndex
        );
      });
      return;
    }

    if (
      activeData.type === 'page-section' &&
      activeData.page === targetPage &&
      overData?.type === 'page-section' &&
      activeData.sectionId !== overData.sectionId
    ) {
      setDraft(currentDraft =>
        moveSectionBefore(
          currentDraft,
          activeData.page,
          activeData.sectionId,
          overData.sectionId
        )
      );
    }
  };

  const addSectionToActivePage = (sectionId: string) => {
    setDraft(currentDraft =>
      addSectionToPageDraft(currentDraft, activePage, sectionId)
    );
    setSelectedSectionId(sectionId);
  };

  const removeSectionFromActivePage = (sectionId: string) => {
    setDraft(currentDraft =>
      removeSectionFromPageDraft(currentDraft, activePage, sectionId)
    );
    setSelectedSectionId(current => (current === sectionId ? null : current));
  };

  const removeDesignArtifact = (artifactId: string) => {
    const sectionId = getArtifactSectionId(artifactId);
    setArtifacts(currentArtifacts =>
      currentArtifacts.filter(artifact => artifact.id !== artifactId)
    );
    setDraft(currentDraft => ({
      ...currentDraft,
      pages: currentDraft.pages.map(pageDraft => ({
        ...pageDraft,
        sectionIds: pageDraft.sectionIds.filter(id => id !== sectionId),
      })),
    }));
    setSelectedSectionId(current => (current === sectionId ? null : current));
  };

  const moveActivePageSection = (sectionId: string, offset: -1 | 1) => {
    setDraft(currentDraft =>
      moveSectionByOffset(currentDraft, activePage, sectionId, offset)
    );
  };

  const movePageSection = (
    page: string,
    fromIndex: number,
    toIndex: number
  ) => {
    setDraft(currentDraft =>
      moveSectionInPageDraft(currentDraft, page, fromIndex, toIndex)
    );
  };

  const handleCopyActiveLayout = async () => {
    setLayoutCopyError(null);

    try {
      await writeTextToClipboard(
        buildMarketingPageLayoutCopy({
          page: activePage,
          sections: activePageSections,
        })
      );
      setCopiedLayout(true);
      window.setTimeout(() => setCopiedLayout(false), 1800);
    } catch {
      setLayoutCopyError('Clipboard permission is unavailable.');
    }
  };

  const handleCopyActiveLayoutPrompt = async () => {
    setLayoutCopyError(null);

    try {
      await writeTextToClipboard(
        buildMarketingPageLayoutPrompt({
          page: activePage,
          sections: activePageSections,
          includeDesignGuidance,
        })
      );
      setCopiedLayoutPrompt(true);
      window.setTimeout(() => setCopiedLayoutPrompt(false), 1800);
    } catch {
      setLayoutCopyError('Clipboard permission is unavailable.');
    }
  };

  const handleRemix = async (section: MarketingSectionEntry) => {
    const prompt = buildMarketingSectionRemixPrompt({
      section,
      aspectRatio: remixAspectRatio,
      includeDesignGuidance,
    });

    setRemixes(previous => ({
      ...previous,
      [section.id]: {
        status: 'generating',
        prompt,
        aspectRatio: remixAspectRatio,
        includeDesignGuidance,
      },
    }));

    try {
      await writeTextToClipboard(prompt);

      setRemixes(previous => ({
        ...previous,
        [section.id]: {
          status: 'prompt-ready',
          prompt,
          aspectRatio: remixAspectRatio,
          includeDesignGuidance,
        },
      }));
    } catch (error) {
      setRemixes(previous => ({
        ...previous,
        [section.id]: {
          status: 'error',
          prompt,
          aspectRatio: remixAspectRatio,
          includeDesignGuidance,
          error: getErrorMessage(error),
        },
      }));
    }
  };

  const handleApproveRemix = (sectionId: string) => {
    setRemixes(previous => {
      const current = previous[sectionId];
      if (!current) {
        return previous;
      }

      return {
        ...previous,
        [sectionId]: {
          ...current,
          status: 'approved',
        },
      };
    });
  };

  const handleRejectRemix = (sectionId: string) => {
    setRemixes(previous => {
      const current = previous[sectionId];
      if (!current) {
        return previous;
      }

      return {
        ...previous,
        [sectionId]: {
          ...current,
          status: 'rejected',
        },
      };
    });
  };

  const handleCopyDesignPrompt = async (section: MarketingSectionEntry) => {
    const remix = remixes[section.id];
    const prompt =
      remix?.prompt ??
      buildMarketingSectionRemixPrompt({
        section,
        aspectRatio: remixAspectRatio,
        includeDesignGuidance,
      });

    try {
      await writeTextToClipboard(prompt);
      setCopiedDesignPromptSectionId(section.id);
      window.setTimeout(() => {
        setCopiedDesignPromptSectionId(current =>
          current === section.id ? null : current
        );
      }, 1800);
    } catch {
      setRemixes(previous => {
        const current = previous[section.id];
        return {
          ...previous,
          [section.id]: {
            status: current?.status ?? 'error',
            prompt,
            aspectRatio: current?.aspectRatio ?? remixAspectRatio,
            includeDesignGuidance:
              current?.includeDesignGuidance ?? includeDesignGuidance,
            imageUrl: current?.imageUrl,
            error: 'Clipboard permission is unavailable.',
          },
        };
      });
    }
  };

  const handleCopyBuildPrompt = async (section: MarketingSectionEntry) => {
    const remix = remixes[section.id];
    const prompt = buildMarketingSectionImplementationPrompt({
      section,
      aspectRatio: remix?.aspectRatio ?? remixAspectRatio,
      includeDesignGuidance:
        remix?.includeDesignGuidance ?? includeDesignGuidance,
      generatedImageUrl: remix?.imageUrl,
      generatedPrompt: remix?.prompt,
    });

    try {
      await writeTextToClipboard(prompt);
      setCopiedBuildPromptSectionId(section.id);
      window.setTimeout(() => {
        setCopiedBuildPromptSectionId(current =>
          current === section.id ? null : current
        );
      }, 1800);
    } catch {
      setRemixes(previous => {
        const current = previous[section.id];
        return {
          ...previous,
          [section.id]: {
            status: current?.status ?? 'error',
            prompt,
            aspectRatio: current?.aspectRatio ?? remixAspectRatio,
            includeDesignGuidance:
              current?.includeDesignGuidance ?? includeDesignGuidance,
            imageUrl: current?.imageUrl,
            error: 'Clipboard permission is unavailable.',
          },
        };
      });
    }
  };

  const handleCopyMockup = async (sectionId: string) => {
    const remix = remixes[sectionId];
    const artifact = artifactBySectionId.get(sectionId);

    try {
      await writeMockupToClipboard(remix?.imageUrl ?? artifact?.imageUrl);
      setCopiedMockupSectionId(sectionId);
      window.setTimeout(() => {
        setCopiedMockupSectionId(current =>
          current === sectionId ? null : current
        );
      }, 1800);
    } catch {
      if (!remix) {
        setArtifactError('Image clipboard permission is unavailable.');
        return;
      }

      setRemixes(previous => {
        const current = previous[sectionId];
        if (!current) {
          return previous;
        }

        return {
          ...previous,
          [sectionId]: {
            ...current,
            error: 'Image clipboard permission is unavailable.',
          },
        };
      });
    }
  };

  if (!mounted) {
    return (
      <DesignStudioShell
        activeTab={activeStudioTab}
        onTabChange={selectStudioTab}
      >
        <BuilderLoadingWorkspace />
      </DesignStudioShell>
    );
  }

  return (
    <DesignStudioShell
      activeTab={activeStudioTab}
      onTabChange={selectStudioTab}
    >
      {activeStudioTab === 'profiles' ? (
        <PublicProfileCanvas />
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <div className='grid h-full min-h-0 overflow-hidden bg-[#050608] text-white lg:grid-cols-[18rem_20rem_minmax(0,1fr)]'>
            <ComponentLibraryPane
              sections={filteredLibrarySections}
              allSectionCount={allSections.length}
              activePage={activePage}
              artifactBySectionId={artifactBySectionId}
              artifactError={artifactError}
              families={families}
              statuses={statuses}
              copyVariantOptions={copyVariantOptions}
              familyFilter={familyFilter}
              statusFilter={statusFilter}
              copyFilter={copyFilter}
              query={query}
              onFamilyFilterChange={setFamilyFilter}
              onStatusFilterChange={setStatusFilter}
              onCopyFilterChange={setCopyFilter}
              onQueryChange={setQuery}
              onAddSection={addSectionToActivePage}
              onAddImageFiles={(files, source) =>
                addDesignArtifactFiles(files, source, activePage)
              }
              onRemoveArtifact={removeDesignArtifact}
            />

            <PageOutlinePane
              activePage={activePage}
              sections={activePageSections}
              selectedSectionId={selectedSectionId}
              layoutCopyError={layoutCopyError}
              copiedLayout={copiedLayout}
              copiedLayoutPrompt={copiedLayoutPrompt}
              includeDesignGuidance={includeDesignGuidance}
              remixAspectRatio={remixAspectRatio}
              onCopyLayout={handleCopyActiveLayout}
              onCopyLayoutPrompt={handleCopyActiveLayoutPrompt}
              onMoveSection={moveActivePageSection}
              onRemoveSection={removeSectionFromActivePage}
              onResetActivePage={resetActivePage}
              onResetAllDrafts={resetAllDrafts}
              onToggleDesignGuidance={setIncludeDesignGuidance}
              onRemixAspectRatioChange={setRemixAspectRatio}
              onSelectSection={setSelectedSectionId}
            />

            <section className='flex min-h-0 min-w-0 flex-col border-t border-white/[0.08] bg-[#050608] lg:border-l lg:border-t-0'>
              <CanvasHeader
                pages={pages}
                draft={draft}
                activePage={activePage}
                previewMode={previewMode}
                viewport={viewport}
                zoom={zoom}
                showSectionChrome={showSectionChrome}
                onSelectPage={selectPage}
                onPreviewModeChange={setPreviewMode}
                onViewportChange={setViewport}
                onZoomChange={setZoom}
                onShowSectionChromeChange={setShowSectionChrome}
              />

              <div
                className='min-h-0 flex-1 overflow-x-auto overflow-y-auto'
                data-testid='marketing-builder-canvas-scroller'
              >
                <div className='flex min-h-full w-max gap-4 p-4'>
                  {draft.pages.map(pageDraft => (
                    <CanvasPageColumn
                      key={pageDraft.page}
                      page={pageDraft.page}
                      sectionIds={pageDraft.sectionIds}
                      sectionsById={sectionsById}
                      artifactBySectionId={artifactBySectionId}
                      active={pageDraft.page === activePage}
                      previewMode={previewMode}
                      viewport={viewport}
                      zoom={zoom}
                      showSectionChrome={showSectionChrome}
                      selectedSectionId={selectedSectionId}
                      onColumnRef={setPageColumnRef}
                      onAddImageFilesToPage={(files, source) =>
                        addDesignArtifactFiles(files, source, pageDraft.page)
                      }
                      onSelectPage={setActivePage}
                      onSelectSection={setSelectedSectionId}
                      onMoveSection={movePageSection}
                      remixes={remixes}
                      copiedBuildPromptSectionId={copiedBuildPromptSectionId}
                      copiedDesignPromptSectionId={copiedDesignPromptSectionId}
                      copiedMockupSectionId={copiedMockupSectionId}
                      onApproveRemix={handleApproveRemix}
                      onCopyBuildPrompt={handleCopyBuildPrompt}
                      onCopyDesignPrompt={handleCopyDesignPrompt}
                      onCopyMockup={handleCopyMockup}
                      onRejectRemix={handleRejectRemix}
                      onRemix={handleRemix}
                    />
                  ))}
                </div>
              </div>
            </section>
          </div>
        </DndContext>
      )}
    </DesignStudioShell>
  );
}

function DesignStudioShell({
  activeTab,
  onTabChange,
  children,
}: Readonly<{
  activeTab: StudioTab;
  onTabChange: (tab: StudioTab) => void;
  children: ReactNode;
}>) {
  return (
    <main
      className='flex h-dvh min-h-0 flex-col overflow-hidden bg-[#050608] text-white'
      data-testid='design-studio'
    >
      <header className='shrink-0 border-b border-white/[0.08] bg-[#08090d]/95 px-4 py-3 backdrop-blur-xl'>
        <div className='flex flex-wrap items-center justify-between gap-3'>
          <div className='min-w-0'>
            <h1 className='text-[20px] font-[680] leading-none tracking-normal text-white'>
              Design Studio
            </h1>
            <p className='mt-1 text-[12px] leading-5 text-white/46'>
              Compose landing pages and review public profile states.
            </p>
          </div>
          <div
            role='tablist'
            aria-label='Design Studio Views'
            className='flex shrink-0 gap-2 overflow-x-auto'
          >
            {STUDIO_TABS.map(tab => {
              const Icon = tab.icon;
              const selected = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type='button'
                  role='tab'
                  aria-selected={selected}
                  onClick={() => onTabChange(tab.id)}
                  className={cn(
                    'inline-flex h-9 shrink-0 items-center gap-2 rounded-[6px] border px-3 text-[12px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30',
                    selected
                      ? 'border-white/[0.22] bg-white/[0.1] text-white'
                      : 'border-white/[0.08] bg-black/20 text-white/54 hover:border-white/[0.16] hover:text-white'
                  )}
                >
                  <Icon className='h-3.5 w-3.5' aria-hidden='true' />
                  {tab.label}
                  <span className='sr-only'>{tab.description}</span>
                </button>
              );
            })}
          </div>
        </div>
      </header>
      <div className='min-h-0 flex-1'>{children}</div>
    </main>
  );
}

function PublicProfileCanvas() {
  return (
    <DemoClientProviders>
      <section
        className='h-full overflow-y-auto overflow-x-hidden bg-[#050608] p-4 text-white'
        data-testid='design-studio-public-profiles'
      >
        <div className='mx-auto grid max-w-[1800px] gap-4'>
          <div className='flex flex-wrap items-end justify-between gap-4 rounded-[8px] border border-white/[0.08] bg-[#08090d] p-4'>
            <div>
              <h2 className='text-[22px] font-[680] tracking-normal text-white'>
                Public Profile Canvas
              </h2>
              <p className='mt-2 max-w-[46rem] text-[13px] leading-6 text-white/52'>
                One read-only board for route modes, release states, and deep
                interaction states using the live public profile components.
              </p>
            </div>
            <nav
              aria-label='Public Profile Canvas Sections'
              className='flex flex-wrap gap-2'
            >
              <ProfileCanvasAnchor href='#profile-modes'>
                Profile Modes
              </ProfileCanvasAnchor>
              <ProfileCanvasAnchor href='#release-states'>
                Release States
              </ProfileCanvasAnchor>
              <ProfileCanvasAnchor href='#deep-states'>
                Deep States
              </ProfileCanvasAnchor>
            </nav>
          </div>

          <ProfileCanvasGroup
            id='profile-modes'
            title='Profile Modes'
            description='Route-like public profile screens rendered through StaticArtistPage.'
          >
            <div className='grid gap-4 xl:grid-cols-2'>
              {PROFILE_MODE_KEYS.map(mode => (
                <ProfileReviewCard
                  key={mode}
                  title={PROFILE_MODE_TITLES[mode]}
                  description={`Mode id: ${mode}`}
                >
                  <StaticProfileStudioPreview
                    mode={mode}
                    latestRelease={PROFILE_LATEST_RELEASES.live}
                    testId={`design-studio-profile-mode-${mode}`}
                  />
                </ProfileReviewCard>
              ))}
            </div>
          </ProfileCanvasGroup>

          <ProfileCanvasGroup
            id='release-states'
            title='Release States'
            description='Live, presave, and video release variations inside the public profile shell.'
          >
            <div className='grid gap-4 xl:grid-cols-3'>
              {PROFILE_RELEASE_REVIEW_ITEMS.map(item => (
                <ProfileReviewCard
                  key={item.id}
                  title={item.title}
                  description={item.description}
                >
                  <StaticProfileStudioPreview
                    mode='profile'
                    latestRelease={item.latestRelease}
                    testId={`design-studio-release-state-${item.id}`}
                  />
                </ProfileReviewCard>
              ))}
            </div>
          </ProfileCanvasGroup>

          <ProfileCanvasGroup
            id='deep-states'
            title='Deep States'
            description='Compact phone states for subscriptions, tips, fallback cards, tour, contact, and catalog review.'
          >
            <div className='grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4'>
              {PROFILE_DEEP_STATE_IDS.map(stateId => {
                const state = HOMEPAGE_PROFILE_SHOWCASE_STATES[stateId];
                return (
                  <ProfileReviewCard
                    key={stateId}
                    title={formatProfileStateLabel(stateId)}
                    description={
                      state.notifications.helper ??
                      formatProfileStateLabel(stateId)
                    }
                  >
                    <DeepProfileStudioPreview stateId={stateId} />
                  </ProfileReviewCard>
                );
              })}
            </div>
          </ProfileCanvasGroup>
        </div>
      </section>
    </DemoClientProviders>
  );
}

function ProfileCanvasAnchor({
  href,
  children,
}: Readonly<{
  href: string;
  children: ReactNode;
}>) {
  return (
    <a
      href={href}
      className='inline-flex h-8 items-center rounded-[6px] border border-white/[0.08] bg-black/25 px-3 text-[12px] font-medium text-white/58 transition-colors hover:border-white/[0.16] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30'
    >
      {children}
    </a>
  );
}

function ProfileCanvasGroup({
  id,
  title,
  description,
  children,
}: Readonly<{
  id: string;
  title: string;
  description: string;
  children: ReactNode;
}>) {
  return (
    <section id={id} className='scroll-mt-4'>
      <div className='mb-3'>
        <h2 className='text-[18px] font-[650] tracking-normal text-white'>
          {title}
        </h2>
        <p className='mt-1 text-[12px] leading-5 text-white/46'>
          {description}
        </p>
      </div>
      {children}
    </section>
  );
}

function ProfileReviewCard({
  title,
  description,
  children,
}: Readonly<{
  title: string;
  description: string;
  children: ReactNode;
}>) {
  return (
    <article className='min-w-0 overflow-hidden rounded-[8px] border border-white/[0.08] bg-[#08090d]'>
      <div className='border-b border-white/[0.08] px-4 py-3'>
        <h3 className='text-[14px] font-[620] tracking-normal text-white/88'>
          {title}
        </h3>
        <p className='mt-1 text-[12px] leading-5 text-white/42'>
          {description}
        </p>
      </div>
      {children}
    </article>
  );
}

function StaticProfileStudioPreview({
  mode,
  latestRelease,
  testId,
}: Readonly<{
  mode: ProfileMode;
  latestRelease: StudioLatestRelease;
  testId: string;
}>) {
  return (
    <div className='h-[760px] overflow-hidden bg-black' data-testid={testId}>
      <StaticArtistPage
        presentation='compact-preview'
        mode={mode}
        artist={HOMEPAGE_PROFILE_PREVIEW_ARTIST}
        subtitle='Official artist profile'
        socialLinks={[...HOMEPAGE_PROFILE_PREVIEW_SOCIAL_LINKS]}
        contacts={[...HOMEPAGE_PROFILE_PREVIEW_CONTACTS]}
        tourDates={[...HOMEPAGE_PROFILE_PREVIEW_TOUR_DATES]}
        latestRelease={latestRelease}
        genres={HOMEPAGE_PROFILE_PREVIEW_ARTIST.genres}
        showBackButton={false}
        showFooter
        showPayButton
        showTourButton
        disableVisitTracking
        disableHistorySync
        showSubscriptionConfirmedBanner={false}
        profileSettings={SHOWCASE_PROFILE_SETTINGS}
        releases={[...HOMEPAGE_PROFILE_PREVIEW_DRAWER_RELEASES]}
        hideJovieBranding
        hideMoreMenu
      />
    </div>
  );
}

function DeepProfileStudioPreview({
  stateId,
}: Readonly<{ stateId: ProfileShowcaseStateId }>) {
  return (
    <div
      className='flex h-[620px] items-start justify-center overflow-hidden bg-black pt-4'
      data-testid={`design-studio-profile-state-${stateId}`}
    >
      <HomeProfileShowcase
        stateId={stateId}
        presentation='full-phone'
        compact
        hideJovieBranding
        hideMoreMenu
        className='origin-top scale-[0.82]'
        phoneClassName='max-w-[23rem]'
      />
    </div>
  );
}

function BuilderLoadingWorkspace() {
  return (
    <div className='grid h-full min-h-0 overflow-hidden bg-[#050608] text-white lg:grid-cols-[18rem_20rem_minmax(0,1fr)]'>
      <aside className='flex min-h-0 flex-col border-b border-white/[0.08] bg-[#08090d] lg:border-b-0 lg:border-r'>
        <div className='border-b border-white/[0.08] p-4'>
          <p className='inline-flex rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-[12px] font-medium text-white/62'>
            Design Studio
          </p>
          <h1 className='mt-4 text-[24px] font-[680] leading-[1] tracking-normal text-white'>
            Component Library
          </h1>
          <p className='mt-2 text-[12px] leading-5 text-white/46'>
            Loading local draft controls.
          </p>
        </div>
      </aside>
      <aside className='hidden min-h-0 flex-col border-r border-white/[0.08] bg-[#07080c] lg:flex'>
        <div className='border-b border-white/[0.08] p-4'>
          <p className='text-[12px] font-medium text-white/46'>Selected Page</p>
          <h2 className='mt-2 text-[24px] font-[680] leading-none tracking-normal text-white'>
            Loading
          </h2>
        </div>
      </aside>
      <section className='hidden min-h-0 min-w-0 flex-col bg-[#050608] lg:flex'>
        <div className='border-b border-white/[0.08] bg-[#08090d]/95 px-4 py-3'>
          <h2 className='text-[18px] font-[650] tracking-normal text-white'>
            Landing Canvas
          </h2>
          <p className='mt-1 text-[12px] leading-5 text-white/46'>
            Preparing section previews.
          </p>
        </div>
      </section>
    </div>
  );
}

function ComponentLibraryPane({
  sections,
  allSectionCount,
  activePage,
  artifactBySectionId,
  artifactError,
  families,
  statuses,
  copyVariantOptions,
  familyFilter,
  statusFilter,
  copyFilter,
  query,
  onFamilyFilterChange,
  onStatusFilterChange,
  onCopyFilterChange,
  onQueryChange,
  onAddSection,
  onAddImageFiles,
  onRemoveArtifact,
}: Readonly<{
  sections: readonly MarketingSectionEntry[];
  allSectionCount: number;
  activePage: string;
  artifactBySectionId: ReadonlyMap<string, DesignArtifact>;
  artifactError: string | null;
  families: readonly MarketingSectionFamily[];
  statuses: readonly MarketingSectionStatus[];
  copyVariantOptions: readonly string[];
  familyFilter: string;
  statusFilter: string;
  copyFilter: string;
  query: string;
  onFamilyFilterChange: (value: string) => void;
  onStatusFilterChange: (value: string) => void;
  onCopyFilterChange: (value: string) => void;
  onQueryChange: (value: string) => void;
  onAddSection: (sectionId: string) => void;
  onAddImageFiles: (
    files: readonly File[],
    source: DesignArtifactSource
  ) => void;
  onRemoveArtifact: (artifactId: string) => void;
}>) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = getImageFilesFromFileList(event.target.files);
    onAddImageFiles(files, 'uploaded');
    event.target.value = '';
  };

  const handleDrop = (event: DragEvent<HTMLElement>) => {
    const files = getImageFilesFromDataTransfer(event.dataTransfer);

    if (files.length === 0) {
      return;
    }

    event.preventDefault();
    onAddImageFiles(files, 'dropped');
  };

  const handleDragOver = (event: DragEvent<HTMLElement>) => {
    if (event.dataTransfer.types.includes('Files')) {
      event.preventDefault();
    }
  };

  return (
    <aside className='flex min-h-0 flex-col border-b border-white/[0.08] bg-[#08090d] lg:border-b-0 lg:border-r'>
      <div className='border-b border-white/[0.08] p-4'>
        <p className='inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-[12px] font-medium text-white/62'>
          <Layers className='h-3.5 w-3.5' aria-hidden='true' />
          Design Studio
        </p>
        <h1 className='mt-4 text-[24px] font-[680] leading-[1] tracking-normal text-white'>
          Component Library
        </h1>
        <p className='mt-2 text-[12px] leading-5 text-white/46'>
          Paste, upload, or drag references into {activePage}.
        </p>
      </div>

      <div className='border-b border-white/[0.08] p-3'>
        <input
          ref={fileInputRef}
          type='file'
          accept='image/*'
          multiple
          className='hidden'
          onChange={handleFileChange}
        />
        <button
          type='button'
          onClick={() => fileInputRef.current?.click()}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          className='w-full rounded-[8px] border border-dashed border-white/[0.14] bg-black/25 p-3 text-left transition-colors hover:border-white/[0.2] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30'
        >
          <div className='flex items-start gap-3'>
            <span className='inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[6px] border border-white/[0.08] bg-white/[0.05] text-white/54'>
              <ImageIcon className='h-4 w-4' aria-hidden='true' />
            </span>
            <div className='min-w-0 flex-1'>
              <p className='text-[13px] font-medium text-white/82'>
                Add Design Reference
              </p>
              <p className='mt-1 text-[12px] leading-5 text-white/42'>
                Paste an image anywhere, drop it here, or upload one. It lands
                on the selected page as a draggable section.
              </p>
            </div>
          </div>
          <span className='mt-3 inline-flex h-8 w-full items-center justify-center gap-2 rounded-[6px] border border-white/[0.08] bg-white/[0.07] px-3 text-[12px] font-medium text-white/72'>
            <Upload className='h-3.5 w-3.5' aria-hidden='true' />
            Upload Reference
          </span>
          {artifactError ? (
            <p className='mt-2 rounded-[6px] border border-amber-300/20 bg-amber-300/10 px-3 py-2 text-[12px] leading-5 text-amber-100/78'>
              {artifactError}
            </p>
          ) : null}
        </button>
      </div>

      <div className='grid gap-2 border-b border-white/[0.08] p-3'>
        <label className='relative flex min-w-0 items-center'>
          <Search
            className='pointer-events-none absolute left-3 h-4 w-4 text-white/36'
            aria-hidden='true'
          />
          <span className='sr-only'>Search sections</span>
          <input
            value={query}
            onChange={event => onQueryChange(event.target.value)}
            placeholder='Search sections'
            className='h-9 w-full rounded-[6px] border border-white/[0.08] bg-black/30 pl-9 pr-3 text-[13px] text-white outline-none transition-colors placeholder:text-white/32 focus:border-white/22'
          />
        </label>
        <FilterSelect
          label='Type'
          value={familyFilter}
          onChange={onFamilyFilterChange}
          options={families}
        />
        <FilterSelect
          label='Status'
          value={statusFilter}
          onChange={onStatusFilterChange}
          options={statuses}
        />
        <FilterSelect
          label='Copy'
          value={copyFilter}
          onChange={onCopyFilterChange}
          options={copyVariantOptions}
        />
      </div>

      <div className='flex items-center justify-between border-b border-white/[0.08] px-4 py-3 text-[12px] text-white/46'>
        <span>
          Showing {sections.length} of {allSectionCount}
        </span>
        <span className='inline-flex items-center gap-1.5'>
          <SlidersHorizontal className='h-3.5 w-3.5' aria-hidden='true' />
          Local Draft
        </span>
      </div>

      <div className='min-h-0 flex-1 overflow-y-auto p-3'>
        <div className='grid gap-2'>
          {sections.map(section => (
            <LibrarySectionItem
              key={section.id}
              section={section}
              artifact={artifactBySectionId.get(section.id)}
              activePage={activePage}
              onAddSection={onAddSection}
              onRemoveArtifact={onRemoveArtifact}
            />
          ))}
        </div>
      </div>
    </aside>
  );
}

function LibrarySectionItem({
  section,
  artifact,
  activePage,
  onAddSection,
  onRemoveArtifact,
}: Readonly<{
  section: MarketingSectionEntry;
  artifact?: DesignArtifact;
  activePage: string;
  onAddSection: (sectionId: string) => void;
  onRemoveArtifact: (artifactId: string) => void;
}>) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: getLibraryDragId(section.id),
      data: {
        type: 'library-section',
        sectionId: section.id,
      } as BuilderDragData,
    });

  return (
    <div
      className={cn(
        'rounded-[8px] border border-white/[0.08] bg-white/[0.035] p-3',
        isDragging && 'opacity-55'
      )}
    >
      <div className='flex items-start justify-between gap-2'>
        <button
          ref={setNodeRef}
          type='button'
          {...attributes}
          {...listeners}
          className='mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] border border-white/[0.08] bg-black/25 text-white/42 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30'
          style={{
            transform: transform
              ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
              : undefined,
          }}
          aria-label={`Drag ${section.label}`}
        >
          <GripVertical className='h-3.5 w-3.5' aria-hidden='true' />
        </button>
        <div className='min-w-0 flex-1'>
          <p className='truncate text-[13px] font-medium text-white/82'>
            {section.label}
          </p>
          <p className='mt-1 line-clamp-2 text-[12px] leading-5 text-white/46'>
            {section.preview.headline}
          </p>
        </div>
        <button
          type='button'
          onClick={() => onAddSection(section.id)}
          className='inline-flex h-7 items-center gap-1.5 rounded-[6px] border border-white/[0.08] bg-black/25 px-2 text-[12px] font-medium text-white/62 transition-colors hover:border-white/[0.16] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30'
        >
          <Plus className='h-3.5 w-3.5' aria-hidden='true' />
          Add
        </button>
      </div>
      {artifact ? (
        <div className='mt-3 overflow-hidden rounded-[6px] border border-white/[0.08] bg-black'>
          <NextImage
            src={artifact.imageUrl}
            alt=''
            width={artifact.width}
            height={artifact.height}
            unoptimized
            className='aspect-video w-full object-cover'
            draggable={false}
          />
        </div>
      ) : null}
      <div className='mt-3 flex flex-wrap items-center gap-1.5'>
        <StatusPill status={section.status} />
        <span className='rounded-full border border-white/[0.07] px-2 py-0.5 text-[11px] text-white/42'>
          {section.family}
        </span>
        <span className='rounded-full border border-white/[0.07] px-2 py-0.5 text-[11px] text-white/42'>
          {section.currentPages.length} Pages
        </span>
        {artifact ? (
          <button
            type='button'
            onClick={() => onRemoveArtifact(artifact.id)}
            className='rounded-full border border-rose-300/20 bg-rose-300/10 px-2 py-0.5 text-[11px] font-medium text-rose-100/72 transition-colors hover:text-rose-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-200/30'
          >
            Remove
          </button>
        ) : null}
      </div>
      <p className='mt-2 truncate text-[11px] text-white/32'>{section.id}</p>
      <p className='sr-only'>Adds to {activePage}</p>
    </div>
  );
}

function PageOutlinePane({
  activePage,
  sections,
  selectedSectionId,
  layoutCopyError,
  copiedLayout,
  copiedLayoutPrompt,
  includeDesignGuidance,
  remixAspectRatio,
  onCopyLayout,
  onCopyLayoutPrompt,
  onMoveSection,
  onRemoveSection,
  onResetActivePage,
  onResetAllDrafts,
  onToggleDesignGuidance,
  onRemixAspectRatioChange,
  onSelectSection,
}: Readonly<{
  activePage: string;
  sections: readonly MarketingSectionEntry[];
  selectedSectionId: string | null;
  layoutCopyError: string | null;
  copiedLayout: boolean;
  copiedLayoutPrompt: boolean;
  includeDesignGuidance: boolean;
  remixAspectRatio: MarketingRemixAspectRatio;
  onCopyLayout: () => void;
  onCopyLayoutPrompt: () => void;
  onMoveSection: (sectionId: string, offset: -1 | 1) => void;
  onRemoveSection: (sectionId: string) => void;
  onResetActivePage: () => void;
  onResetAllDrafts: () => void;
  onToggleDesignGuidance: (value: boolean) => void;
  onRemixAspectRatioChange: (value: MarketingRemixAspectRatio) => void;
  onSelectSection: (sectionId: string) => void;
}>) {
  const selectedSection =
    sections.find(section => section.id === selectedSectionId) ?? null;

  return (
    <aside className='flex min-h-0 flex-col border-b border-white/[0.08] bg-[#07080c] lg:border-b-0 lg:border-r'>
      <div className='border-b border-white/[0.08] p-4'>
        <p className='text-[12px] font-medium text-white/46'>Selected Page</p>
        <h2 className='mt-2 text-[24px] font-[680] leading-none tracking-normal text-white'>
          {activePage}
        </h2>
        <p className='mt-2 text-[12px] leading-5 text-white/46'>
          {sections.length} sections in this local draft.
        </p>
      </div>

      <div className='grid gap-2 border-b border-white/[0.08] p-3'>
        <button
          type='button'
          onClick={onCopyLayout}
          className='inline-flex h-9 items-center justify-center gap-2 rounded-[6px] border border-white/[0.1] bg-white/[0.08] px-3 text-[12px] font-medium text-white/78 transition-colors hover:bg-white/[0.12] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30'
        >
          <Copy className='h-3.5 w-3.5' aria-hidden='true' />
          {copiedLayout ? 'Layout Copied' : 'Copy Layout'}
        </button>
        <button
          type='button'
          onClick={onCopyLayoutPrompt}
          className='inline-flex h-9 items-center justify-center gap-2 rounded-[6px] border border-white/[0.08] bg-black/25 px-3 text-[12px] font-medium text-white/62 transition-colors hover:border-white/[0.16] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30'
        >
          <Copy className='h-3.5 w-3.5' aria-hidden='true' />
          {copiedLayoutPrompt ? 'Prompt Copied' : 'Copy Build Prompt'}
        </button>
        {layoutCopyError ? (
          <p className='rounded-[6px] border border-rose-300/20 bg-rose-300/10 px-3 py-2 text-[12px] leading-5 text-rose-100/72'>
            {layoutCopyError}
          </p>
        ) : null}
      </div>

      <div className='border-b border-white/[0.08] p-3'>
        <p className='text-[11px] font-medium text-white/42'>
          Selected Section
        </p>
        {selectedSection ? (
          <div className='mt-2 rounded-[8px] border border-white/[0.08] bg-white/[0.035] p-3'>
            <p className='truncate text-[13px] font-medium text-white/82'>
              {selectedSection.label}
            </p>
            <p className='mt-1 line-clamp-2 text-[12px] leading-5 text-white/42'>
              {selectedSection.preview.headline}
            </p>
            <div className='mt-3 flex flex-wrap gap-1.5'>
              <StatusPill status={selectedSection.status} />
              <span className='rounded-full border border-white/[0.07] px-2 py-0.5 text-[11px] text-white/42'>
                {selectedSection.family}
              </span>
              {isArtifactSectionId(selectedSection.id) ? (
                <span className='rounded-full border border-sky-300/20 bg-sky-300/10 px-2 py-0.5 text-[11px] font-medium text-sky-100/76'>
                  Image Reference
                </span>
              ) : null}
            </div>
          </div>
        ) : (
          <p className='mt-2 rounded-[8px] border border-dashed border-white/[0.1] p-3 text-[12px] leading-5 text-white/38'>
            Click a section in the canvas to inspect it here.
          </p>
        )}
      </div>

      <div className='grid gap-2 border-b border-white/[0.08] p-3'>
        <label className='flex h-9 items-center gap-3 rounded-[6px] border border-white/[0.08] bg-black/25 px-3 text-[12px] text-white/72'>
          <input
            type='checkbox'
            checked={includeDesignGuidance}
            onChange={event => onToggleDesignGuidance(event.target.checked)}
            className='h-4 w-4 rounded border-white/20 bg-black accent-white'
          />
          <span>Include Design Guidance</span>
        </label>
        <FilterSelect
          label='Mockup Ratio'
          value={remixAspectRatio}
          onChange={value =>
            onRemixAspectRatioChange(value as MarketingRemixAspectRatio)
          }
          options={MARKETING_REMIX_ASPECT_RATIOS}
          includeAll={false}
        />
      </div>

      <div className='flex items-center gap-2 border-b border-white/[0.08] p-3'>
        <button
          type='button'
          onClick={onResetActivePage}
          className='inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-[6px] border border-white/[0.08] bg-black/25 px-2 text-[12px] font-medium text-white/54 transition-colors hover:border-white/[0.16] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30'
        >
          <RotateCcw className='h-3.5 w-3.5' aria-hidden='true' />
          Reset Page
        </button>
        <button
          type='button'
          onClick={onResetAllDrafts}
          className='inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-[6px] border border-white/[0.08] bg-black/25 px-2 text-[12px] font-medium text-white/54 transition-colors hover:border-white/[0.16] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30'
        >
          <RotateCcw className='h-3.5 w-3.5' aria-hidden='true' />
          Reset All
        </button>
      </div>

      <div className='min-h-0 flex-1 overflow-y-auto p-3'>
        <div className='grid gap-2'>
          {sections.map((section, index) => (
            <div
              key={section.id}
              className={cn(
                'rounded-[8px] border bg-white/[0.035] p-3 transition-colors',
                selectedSectionId === section.id
                  ? 'border-white/[0.24]'
                  : 'border-white/[0.08]'
              )}
            >
              <button
                type='button'
                onClick={() => onSelectSection(section.id)}
                className='flex w-full items-start gap-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30'
              >
                <span className='mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/[0.08] text-[11px] font-medium text-white/54'>
                  {index + 1}
                </span>
                <div className='min-w-0 flex-1'>
                  <p className='truncate text-[13px] font-medium text-white/82'>
                    {section.label}
                  </p>
                  <p className='mt-1 line-clamp-2 text-[12px] leading-5 text-white/42'>
                    {section.preview.headline}
                  </p>
                </div>
              </button>
              <div className='mt-3 grid grid-cols-3 gap-1.5'>
                <button
                  type='button'
                  onClick={() => onMoveSection(section.id, -1)}
                  disabled={index === 0}
                  className='inline-flex h-8 items-center justify-center rounded-[6px] border border-white/[0.08] bg-black/20 text-white/52 transition-colors hover:text-white disabled:cursor-not-allowed disabled:opacity-35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30'
                  aria-label={`Move ${section.label} up`}
                >
                  <ArrowUp className='h-3.5 w-3.5' aria-hidden='true' />
                </button>
                <button
                  type='button'
                  onClick={() => onMoveSection(section.id, 1)}
                  disabled={index === sections.length - 1}
                  className='inline-flex h-8 items-center justify-center rounded-[6px] border border-white/[0.08] bg-black/20 text-white/52 transition-colors hover:text-white disabled:cursor-not-allowed disabled:opacity-35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30'
                  aria-label={`Move ${section.label} down`}
                >
                  <ArrowDown className='h-3.5 w-3.5' aria-hidden='true' />
                </button>
                <button
                  type='button'
                  onClick={() => onRemoveSection(section.id)}
                  className='inline-flex h-8 items-center justify-center rounded-[6px] border border-rose-300/20 bg-rose-300/10 text-rose-100/70 transition-colors hover:text-rose-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-200/30'
                  aria-label={`Remove ${section.label}`}
                >
                  <Trash2 className='h-3.5 w-3.5' aria-hidden='true' />
                </button>
              </div>
            </div>
          ))}
          {sections.length === 0 ? (
            <div className='rounded-[8px] border border-dashed border-white/[0.1] p-4 text-[13px] leading-6 text-white/42'>
              Drag sections from the library or use Add to build this page.
            </div>
          ) : null}
        </div>
      </div>
    </aside>
  );
}

function CanvasHeader({
  pages,
  draft,
  activePage,
  previewMode,
  viewport,
  zoom,
  showSectionChrome,
  onSelectPage,
  onPreviewModeChange,
  onViewportChange,
  onZoomChange,
  onShowSectionChromeChange,
}: Readonly<{
  pages: readonly string[];
  draft: MarketingLayoutDraft;
  activePage: string;
  previewMode: StudioPreviewMode;
  viewport: StudioViewport;
  zoom: StudioZoom;
  showSectionChrome: boolean;
  onSelectPage: (page: string) => void;
  onPreviewModeChange: (value: StudioPreviewMode) => void;
  onViewportChange: (value: StudioViewport) => void;
  onZoomChange: (value: StudioZoom) => void;
  onShowSectionChromeChange: (value: boolean) => void;
}>) {
  return (
    <div className='shrink-0 border-b border-white/[0.08] bg-[#08090d]/95 px-4 py-3'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <div>
          <h2 className='text-[18px] font-[650] tracking-normal text-white'>
            Landing Canvas
          </h2>
          <p className='mt-1 text-[12px] leading-5 text-white/46'>
            Static references stay fast. Switch to live only when you need to
            inspect production behavior.
          </p>
        </div>
        <div className='flex flex-wrap items-center gap-2'>
          <SegmentedControl
            label='Preview Mode'
            value={previewMode}
            options={[
              { label: 'Static', value: 'static' },
              { label: 'Live', value: 'live' },
            ]}
            onChange={value => onPreviewModeChange(value as StudioPreviewMode)}
          />
          <SegmentedControl
            label='Viewport'
            value={viewport}
            options={[
              { label: 'Desktop', value: 'desktop' },
              { label: 'Tablet', value: 'tablet' },
              { label: 'Mobile', value: 'mobile' },
            ]}
            onChange={value => onViewportChange(value as StudioViewport)}
          />
          <SegmentedControl
            label='Zoom'
            value={String(zoom)}
            options={STUDIO_ZOOM_OPTIONS.map(option => ({
              label: `${Math.round(option * 100)}%`,
              value: String(option),
            }))}
            onChange={value => onZoomChange(Number(value) as StudioZoom)}
          />
          <label className='inline-flex h-8 items-center gap-2 rounded-[6px] border border-white/[0.08] bg-black/25 px-2.5 text-[12px] font-medium text-white/58'>
            <input
              type='checkbox'
              checked={showSectionChrome}
              onChange={event =>
                onShowSectionChromeChange(event.target.checked)
              }
              className='h-3.5 w-3.5 rounded border-white/20 bg-black accent-white'
            />
            Labels
          </label>
        </div>
      </div>
      <div className='mt-3 flex gap-2 overflow-x-auto pb-1'>
        {pages.map(page => {
          const pageDraft = getMarketingPageDraft(draft, page);
          return (
            <button
              key={page}
              type='button'
              onClick={() => onSelectPage(page)}
              className={cn(
                'inline-flex h-9 shrink-0 items-center gap-2 rounded-[6px] border px-3 text-[12px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30',
                activePage === page
                  ? 'border-white/[0.22] bg-white/[0.1] text-white'
                  : 'border-white/[0.08] bg-black/20 text-white/54 hover:border-white/[0.16] hover:text-white'
              )}
            >
              {page}
              <span className='rounded-full bg-white/[0.08] px-1.5 py-0.5 text-[11px] text-white/48'>
                {pageDraft.sectionIds.length}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function CanvasPageColumn({
  page,
  sectionIds,
  sectionsById,
  artifactBySectionId,
  active,
  previewMode,
  viewport,
  zoom,
  showSectionChrome,
  selectedSectionId,
  onColumnRef,
  onAddImageFilesToPage,
  onSelectPage,
  onSelectSection,
  onMoveSection,
  remixes,
  copiedBuildPromptSectionId,
  copiedDesignPromptSectionId,
  copiedMockupSectionId,
  onApproveRemix,
  onCopyBuildPrompt,
  onCopyDesignPrompt,
  onCopyMockup,
  onRejectRemix,
  onRemix,
}: Readonly<{
  page: string;
  sectionIds: readonly string[];
  sectionsById: ReadonlyMap<string, MarketingSectionEntry>;
  artifactBySectionId: ReadonlyMap<string, DesignArtifact>;
  active: boolean;
  previewMode: StudioPreviewMode;
  viewport: StudioViewport;
  zoom: StudioZoom;
  showSectionChrome: boolean;
  selectedSectionId: string | null;
  onColumnRef: (page: string, node: HTMLDivElement | null) => void;
  onAddImageFilesToPage: (
    files: readonly File[],
    source: DesignArtifactSource
  ) => void;
  onSelectPage: (page: string) => void;
  onSelectSection: (sectionId: string) => void;
  onMoveSection: (page: string, fromIndex: number, toIndex: number) => void;
  remixes: Record<string, SectionRemixState | undefined>;
  copiedBuildPromptSectionId: string | null;
  copiedDesignPromptSectionId: string | null;
  copiedMockupSectionId: string | null;
  onApproveRemix: (sectionId: string) => void;
  onCopyBuildPrompt: (section: MarketingSectionEntry) => void;
  onCopyDesignPrompt: (section: MarketingSectionEntry) => void;
  onCopyMockup: (sectionId: string) => void;
  onRejectRemix: (sectionId: string) => void;
  onRemix: (section: MarketingSectionEntry) => void;
}>) {
  const { isOver, setNodeRef } = useDroppable({
    id: getPageDropId(page),
    data: { type: 'page-drop', page } as BuilderDragData,
  });
  const setColumnRef = (node: HTMLDivElement | null) => {
    setNodeRef(node);
    onColumnRef(page, node);
  };
  const sections = sectionIds.flatMap(sectionId => {
    const section = sectionsById.get(sectionId);
    return section ? [section] : [];
  });
  const pageWidth = Math.round(STUDIO_VIEWPORT_WIDTHS[viewport] * zoom);
  const handleDrop = (event: DragEvent<HTMLElement>) => {
    const files = getImageFilesFromDataTransfer(event.dataTransfer);

    if (files.length === 0) {
      return;
    }

    event.preventDefault();
    onAddImageFilesToPage(files, 'dropped');
  };
  const handleDragOver = (event: DragEvent<HTMLElement>) => {
    if (event.dataTransfer.types.includes('Files')) {
      event.preventDefault();
    }
  };

  return (
    <section
      ref={setColumnRef}
      aria-label={`${page} landing page canvas`}
      className={cn(
        'min-h-full shrink-0 rounded-[8px] border bg-[#08090d]',
        active ? 'border-white/[0.2]' : 'border-white/[0.08]',
        isOver && 'border-sky-200/40'
      )}
      style={{ width: pageWidth }}
      data-testid={`marketing-builder-page-${page}`}
    >
      <div className='sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-white/[0.08] bg-[#08090d]/95 p-4 backdrop-blur-xl'>
        <div>
          <h3 className='text-[18px] font-[650] tracking-normal text-white'>
            {page}
          </h3>
          <p className='mt-1 text-[12px] text-white/42'>
            {sections.length} sections
          </p>
        </div>
        <button
          type='button'
          onClick={() => onSelectPage(page)}
          className='rounded-[6px] border border-white/[0.08] bg-black/25 px-2.5 py-1 text-[12px] font-medium text-white/52 transition-colors hover:border-white/[0.16] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30'
        >
          Select
        </button>
      </div>

      <SortableContext
        items={sectionIds.map(sectionId =>
          getPageSectionDragId(page, sectionId)
        )}
        strategy={verticalListSortingStrategy}
      >
        <div className='grid gap-4 p-4'>
          <button
            type='button'
            onClick={() => onSelectPage(page)}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            className='rounded-[8px] border border-dashed border-white/[0.1] bg-black/20 px-3 py-2 text-left text-[12px] leading-5 text-white/42 transition-colors hover:border-white/[0.18] hover:text-white/58 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30'
          >
            Drop an image here to add it to {page}.
          </button>
          {sections.map((section, index) => (
            <SortableCanvasSection
              key={section.id}
              page={page}
              index={index}
              section={section}
              sectionCount={sections.length}
              artifact={artifactBySectionId.get(section.id)}
              previewMode={previewMode}
              showSectionChrome={showSectionChrome}
              selected={selectedSectionId === section.id}
              remix={remixes[section.id]}
              buildPromptCopied={copiedBuildPromptSectionId === section.id}
              designPromptCopied={copiedDesignPromptSectionId === section.id}
              mockupCopied={copiedMockupSectionId === section.id}
              onApproveRemix={onApproveRemix}
              onCopyBuildPrompt={onCopyBuildPrompt}
              onCopyDesignPrompt={onCopyDesignPrompt}
              onCopyMockup={onCopyMockup}
              onMoveSection={(fromIndex, toIndex) =>
                onMoveSection(page, fromIndex, toIndex)
              }
              onSelectSection={onSelectSection}
              onRejectRemix={onRejectRemix}
              onRemix={onRemix}
            />
          ))}
          {sections.length === 0 ? (
            <div className='rounded-[8px] border border-dashed border-white/[0.12] p-8 text-center text-[13px] leading-6 text-white/42'>
              Drop sections here to compose {page}.
            </div>
          ) : null}
        </div>
      </SortableContext>
    </section>
  );
}

function SortableCanvasSection({
  page,
  index,
  section,
  sectionCount,
  artifact,
  previewMode,
  showSectionChrome,
  selected,
  remix,
  buildPromptCopied,
  designPromptCopied,
  mockupCopied,
  onApproveRemix,
  onCopyBuildPrompt,
  onCopyDesignPrompt,
  onCopyMockup,
  onMoveSection,
  onSelectSection,
  onRejectRemix,
  onRemix,
}: Readonly<{
  page: string;
  index: number;
  section: MarketingSectionEntry;
  sectionCount: number;
  artifact?: DesignArtifact;
  previewMode: StudioPreviewMode;
  showSectionChrome: boolean;
  selected: boolean;
  remix?: SectionRemixState;
  buildPromptCopied: boolean;
  designPromptCopied: boolean;
  mockupCopied: boolean;
  onApproveRemix: (sectionId: string) => void;
  onCopyBuildPrompt: (section: MarketingSectionEntry) => void;
  onCopyDesignPrompt: (section: MarketingSectionEntry) => void;
  onCopyMockup: (sectionId: string) => void;
  onMoveSection: (fromIndex: number, toIndex: number) => void;
  onSelectSection: (sectionId: string) => void;
  onRejectRemix: (sectionId: string) => void;
  onRemix: (section: MarketingSectionEntry) => void;
}>) {
  const {
    attributes,
    listeners,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: getPageSectionDragId(page, section.id),
    data: {
      type: 'page-section',
      page,
      sectionId: section.id,
    } as BuilderDragData,
  });

  return (
    <article
      ref={setNodeRef}
      id={getSectionDomId(page, section.id)}
      className={cn(
        'overflow-hidden rounded-[8px] border bg-black transition-colors',
        selected ? 'border-white/[0.28]' : 'border-white/[0.08]',
        isDragging && 'opacity-60'
      )}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
    >
      {showSectionChrome ? (
        <div className='flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] bg-white/[0.025] px-4 py-3'>
          <div className='flex min-w-0 items-center gap-2'>
            <button
              ref={setActivatorNodeRef}
              type='button'
              {...attributes}
              {...listeners}
              className='inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[6px] border border-white/[0.08] bg-black/25 text-white/42 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30'
              aria-label={`Drag ${section.label}`}
            >
              <GripVertical className='h-3.5 w-3.5' aria-hidden='true' />
            </button>
            <span className='inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/[0.08] text-[12px] font-medium text-white/58'>
              {index + 1}
            </span>
            <button
              type='button'
              onClick={() => onSelectSection(section.id)}
              className='min-w-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30'
            >
              <p className='truncate text-[13px] font-medium text-white/82'>
                {section.label}
              </p>
              <p className='truncate text-[11px] text-white/36'>{section.id}</p>
            </button>
          </div>
          <div className='flex items-center gap-1.5'>
            <button
              type='button'
              onClick={() => onMoveSection(index, index - 1)}
              disabled={index === 0}
              className='inline-flex h-8 w-8 items-center justify-center rounded-[6px] border border-white/[0.08] bg-black/20 text-white/52 transition-colors hover:text-white disabled:cursor-not-allowed disabled:opacity-35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30'
              aria-label={`Move ${section.label} up`}
            >
              <ArrowUp className='h-3.5 w-3.5' aria-hidden='true' />
            </button>
            <button
              type='button'
              onClick={() => onMoveSection(index, index + 1)}
              disabled={index === sectionCount - 1}
              className='inline-flex h-8 w-8 items-center justify-center rounded-[6px] border border-white/[0.08] bg-black/20 text-white/52 transition-colors hover:text-white disabled:cursor-not-allowed disabled:opacity-35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30'
              aria-label={`Move ${section.label} down`}
            >
              <ArrowDown className='h-3.5 w-3.5' aria-hidden='true' />
            </button>
          </div>
        </div>
      ) : null}

      <LiveSectionFrame
        section={section}
        artifact={artifact}
        previewMode={previewMode}
        remix={remix}
        buildPromptCopied={buildPromptCopied}
        designPromptCopied={designPromptCopied}
        mockupCopied={mockupCopied}
        onApproveRemix={onApproveRemix}
        onCopyBuildPrompt={onCopyBuildPrompt}
        onCopyDesignPrompt={onCopyDesignPrompt}
        onCopyMockup={onCopyMockup}
        onRejectRemix={onRejectRemix}
        onRemix={onRemix}
      />
    </article>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
  includeAll = true,
}: Readonly<{
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly string[];
  includeAll?: boolean;
}>) {
  return (
    <label className='grid gap-1.5'>
      <span className='text-[11px] font-medium text-white/42'>{label}</span>
      <select
        value={value}
        onChange={event => onChange(event.target.value)}
        className='h-9 rounded-[6px] border border-white/[0.08] bg-black/30 px-3 text-[13px] text-white outline-none transition-colors focus:border-white/22'
      >
        {includeAll ? <option value={ALL}>All</option> : null}
        {options.map(option => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function SegmentedControl({
  label,
  value,
  options,
  onChange,
}: Readonly<{
  label: string;
  value: string;
  options: readonly { readonly label: string; readonly value: string }[];
  onChange: (value: string) => void;
}>) {
  return (
    <div className='inline-flex h-8 items-center overflow-hidden rounded-[6px] border border-white/[0.08] bg-black/25'>
      <span className='sr-only'>{label}</span>
      {options.map(option => (
        <button
          key={option.value}
          type='button'
          onClick={() => onChange(option.value)}
          className={cn(
            'h-full px-2.5 text-[12px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30',
            value === option.value
              ? 'bg-white/[0.1] text-white'
              : 'text-white/48 hover:text-white'
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function StatusPill({ status }: Readonly<{ status: MarketingSectionStatus }>) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium',
        status === 'Keep' && 'border-white/[0.16] bg-white/[0.1] text-white/78',
        status === 'Variant Copy' &&
          'border-sky-300/20 bg-sky-300/10 text-sky-100/78',
        status === 'Candidate' &&
          'border-emerald-300/20 bg-emerald-300/10 text-emerald-100/78',
        status === 'Consolidate' &&
          'border-amber-300/20 bg-amber-300/10 text-amber-100/78',
        status === 'Delete Review' &&
          'border-rose-300/20 bg-rose-300/10 text-rose-100/78'
      )}
    >
      {status === 'Keep' ? (
        <Check className='h-3 w-3' aria-hidden='true' />
      ) : null}
      {status}
    </span>
  );
}

function LiveSectionFrame({
  section,
  artifact,
  previewMode,
  remix,
  buildPromptCopied,
  designPromptCopied,
  mockupCopied,
  onApproveRemix,
  onCopyBuildPrompt,
  onCopyDesignPrompt,
  onCopyMockup,
  onRejectRemix,
  onRemix,
}: Readonly<{
  section: MarketingSectionEntry;
  artifact?: DesignArtifact;
  previewMode: StudioPreviewMode;
  remix?: SectionRemixState;
  buildPromptCopied: boolean;
  designPromptCopied: boolean;
  mockupCopied: boolean;
  onApproveRemix: (sectionId: string) => void;
  onCopyBuildPrompt: (section: MarketingSectionEntry) => void;
  onCopyDesignPrompt: (section: MarketingSectionEntry) => void;
  onCopyMockup: (sectionId: string) => void;
  onRejectRemix: (sectionId: string) => void;
  onRemix: (section: MarketingSectionEntry) => void;
}>) {
  const liveSection =
    previewMode === 'live' && !artifact ? getLiveSection(section.id) : null;
  const hasLiveSection = liveSection !== null;
  const isGenerating = remix?.status === 'generating';
  const showGeneratedRemix =
    !!remix?.imageUrl &&
    (remix.status === 'ready' || remix.status === 'approved');
  const isPromptReady = remix?.status === 'prompt-ready';
  const showImageReference = showGeneratedRemix || !!artifact;
  const frameLabel = artifact
    ? 'Image Reference'
    : showGeneratedRemix
      ? 'Generated Mockup'
      : hasLiveSection
        ? 'Live Component'
        : 'Static Preview';
  const frameDescription = artifact
    ? 'Local pasted or uploaded design reference.'
    : showGeneratedRemix
      ? 'Generated mockup is replacing the static preview locally.'
      : hasLiveSection
        ? 'Rendered from the production marketing component.'
        : 'Fast static thumbnail for arranging the page without hydration cost.';

  return (
    <div className='bg-black'>
      <div className='flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] bg-white/[0.025] px-4 py-3'>
        <div>
          <p className='text-[12px] font-medium text-white/72'>{frameLabel}</p>
          <p className='mt-0.5 text-[11px] leading-4 text-white/38'>
            {frameDescription}
          </p>
        </div>
        <div className='flex flex-wrap items-center gap-2'>
          <RemixStatePill remix={remix} />
          {artifact ? (
            <span className='rounded-full border border-sky-300/20 bg-sky-300/10 px-2.5 py-1 text-[11px] font-medium text-sky-100/78'>
              Local Image
            </span>
          ) : hasLiveSection ? (
            <span className='rounded-full border border-emerald-300/20 bg-emerald-300/10 px-2.5 py-1 text-[11px] font-medium text-emerald-100/78'>
              Embedded
            </span>
          ) : (
            <span className='rounded-full border border-white/[0.08] bg-black/20 px-2.5 py-1 text-[11px] font-medium text-white/46'>
              Needs Mapping
            </span>
          )}
          <button
            type='button'
            onClick={() => onCopyDesignPrompt(section)}
            className='inline-flex h-8 items-center gap-1.5 rounded-[6px] border border-white/[0.08] bg-black/20 px-2.5 text-[12px] font-medium text-white/62 transition-colors hover:border-white/[0.16] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30'
          >
            <Copy className='h-3.5 w-3.5' aria-hidden='true' />
            {designPromptCopied ? 'Design Copied' : 'Copy Design Prompt'}
          </button>
          <button
            type='button'
            onClick={() => onCopyBuildPrompt(section)}
            className='inline-flex h-8 items-center gap-1.5 rounded-[6px] border border-white/[0.08] bg-black/20 px-2.5 text-[12px] font-medium text-white/62 transition-colors hover:border-white/[0.16] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30'
          >
            <Copy className='h-3.5 w-3.5' aria-hidden='true' />
            {buildPromptCopied ? 'Build Copied' : 'Copy Build Prompt'}
          </button>
          <button
            type='button'
            onClick={() => onRemix(section)}
            disabled={isGenerating}
            className='inline-flex h-8 items-center gap-1.5 rounded-[6px] border border-white/[0.1] bg-white/[0.08] px-2.5 text-[12px] font-medium text-white/78 transition-colors hover:border-white/[0.18] hover:bg-white/[0.12] disabled:cursor-not-allowed disabled:opacity-55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30'
          >
            {isGenerating ? (
              <RefreshCw
                className='h-3.5 w-3.5 animate-spin'
                aria-hidden='true'
              />
            ) : (
              <Sparkles className='h-3.5 w-3.5' aria-hidden='true' />
            )}
            {isGenerating
              ? 'Generating'
              : isPromptReady
                ? 'Copy Again'
                : remix?.imageUrl
                  ? 'Try Again'
                  : 'Remix'}
          </button>
          {showImageReference ? (
            <>
              <button
                type='button'
                onClick={() => onCopyMockup(section.id)}
                className='inline-flex h-8 items-center gap-1.5 rounded-[6px] border border-white/[0.08] bg-black/20 px-2.5 text-[12px] font-medium text-white/62 transition-colors hover:border-white/[0.16] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30'
              >
                <ImageIcon className='h-3.5 w-3.5' aria-hidden='true' />
                {mockupCopied ? 'Image Copied' : 'Copy Image'}
              </button>
              {showGeneratedRemix ? (
                <>
                  <button
                    type='button'
                    onClick={() => onApproveRemix(section.id)}
                    className='inline-flex h-8 items-center gap-1.5 rounded-[6px] border border-emerald-300/20 bg-emerald-300/10 px-2.5 text-[12px] font-medium text-emerald-100/78 transition-colors hover:border-emerald-200/30 hover:text-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200/30'
                  >
                    <Check className='h-3.5 w-3.5' aria-hidden='true' />
                    Approve
                  </button>
                  <button
                    type='button'
                    onClick={() => onRejectRemix(section.id)}
                    className='inline-flex h-8 items-center gap-1.5 rounded-[6px] border border-rose-300/20 bg-rose-300/10 px-2.5 text-[12px] font-medium text-rose-100/78 transition-colors hover:border-rose-200/30 hover:text-rose-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-200/30'
                  >
                    <X className='h-3.5 w-3.5' aria-hidden='true' />
                    Reject
                  </button>
                </>
              ) : null}
            </>
          ) : null}
        </div>
      </div>

      <div className='marketing-section-live-preview overflow-x-hidden bg-black text-primary-token'>
        {showGeneratedRemix ? (
          <GeneratedRemixPreview section={section} remix={remix} />
        ) : artifact ? (
          <DesignArtifactPreview artifact={artifact} />
        ) : (
          (liveSection ?? <SectionPreview section={section} />)
        )}
      </div>
      {remix?.error ? (
        <div className='border-t border-white/[0.08] bg-rose-300/10 px-4 py-3 text-[12px] leading-5 text-rose-100/72'>
          {remix.error}
        </div>
      ) : null}
      {isPromptReady ? (
        <div className='border-t border-white/[0.08] bg-sky-300/10 px-4 py-3 text-[12px] leading-5 text-sky-100/72'>
          Design prompt copied. Generate the mockup externally, then paste or
          upload the result with Add Design Reference.
        </div>
      ) : null}
      {remix?.status === 'rejected' ? (
        <div className='border-t border-white/[0.08] bg-white/[0.025] px-4 py-3 text-[12px] leading-5 text-white/48'>
          Rejected locally. The production section is visible again.
        </div>
      ) : null}
    </div>
  );
}

function RemixStatePill({ remix }: Readonly<{ remix?: SectionRemixState }>) {
  if (!remix) {
    return null;
  }

  return (
    <span
      className={cn(
        'rounded-full border px-2.5 py-1 text-[11px] font-medium',
        remix.status === 'generating' &&
          'border-sky-300/20 bg-sky-300/10 text-sky-100/78',
        remix.status === 'prompt-ready' &&
          'border-sky-300/20 bg-sky-300/10 text-sky-100/78',
        remix.status === 'ready' &&
          'border-white/[0.14] bg-white/[0.08] text-white/68',
        remix.status === 'approved' &&
          'border-emerald-300/20 bg-emerald-300/10 text-emerald-100/78',
        remix.status === 'rejected' &&
          'border-rose-300/20 bg-rose-300/10 text-rose-100/78',
        remix.status === 'error' &&
          'border-amber-300/20 bg-amber-300/10 text-amber-100/78'
      )}
    >
      {remix.status === 'generating' && 'Generating'}
      {remix.status === 'prompt-ready' && 'Prompt Copied'}
      {remix.status === 'ready' && 'Ready'}
      {remix.status === 'approved' && 'Approved'}
      {remix.status === 'rejected' && 'Rejected'}
      {remix.status === 'error' && 'Copy Failed'}
    </span>
  );
}

function GeneratedRemixPreview({
  section,
  remix,
}: Readonly<{
  section: MarketingSectionEntry;
  remix: SectionRemixState;
}>) {
  return (
    <div className='bg-[#050608] p-4 sm:p-6'>
      <div className='mx-auto max-w-6xl overflow-hidden rounded-[8px] border border-white/[0.08] bg-black'>
        <div
          role='img'
          aria-label={`Generated remix for ${section.label}`}
          className='w-full bg-black bg-contain bg-center bg-no-repeat'
          style={{
            aspectRatio: remix.aspectRatio.replace(':', ' / '),
            backgroundImage: `url("${remix.imageUrl}")`,
          }}
        />
      </div>
    </div>
  );
}

function DesignArtifactPreview({
  artifact,
}: Readonly<{ artifact: DesignArtifact }>) {
  const aspectRatio =
    artifact.width > 0 && artifact.height > 0
      ? `${artifact.width} / ${artifact.height}`
      : '16 / 9';

  return (
    <div className='bg-[#050608] p-3 sm:p-4'>
      <div className='mx-auto overflow-hidden rounded-[8px] border border-white/[0.08] bg-black'>
        <NextImage
          src={artifact.imageUrl}
          alt={artifact.title}
          width={artifact.width}
          height={artifact.height}
          unoptimized
          className='w-full object-contain'
          style={{ aspectRatio }}
          draggable={false}
        />
      </div>
    </div>
  );
}

function SectionPreview({
  section,
}: Readonly<{ section: MarketingSectionEntry }>) {
  const { preview } = section;

  return (
    <div className='relative flex min-h-[18rem] items-stretch overflow-hidden bg-black'>
      <div
        aria-hidden='true'
        className='pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_100%,rgba(0,112,243,0.18),transparent_52%)]'
      />
      <div className='relative z-[1] flex w-full flex-col justify-between p-5 sm:p-6'>
        <div>
          <h3 className='max-w-[14ch] text-balance text-[clamp(1.45rem,2.4vw,2.5rem)] font-[680] leading-[0.98] tracking-normal text-white'>
            {preview.headline}
          </h3>
          {preview.body ? (
            <p className='mt-3 max-w-[28rem] text-[13px] leading-6 text-white/54'>
              {preview.body}
            </p>
          ) : null}
        </div>

        <PreviewGraphic section={section} />
      </div>
    </div>
  );
}

function PreviewGraphic({
  section,
}: Readonly<{ section: MarketingSectionEntry }>) {
  const { preview } = section;

  if (preview.kind === 'logo-strip') {
    return (
      <div className='mt-8 grid grid-cols-3 gap-2'>
        {(preview.chips ?? []).map(chip => (
          <div
            key={chip}
            className='h-12 rounded-[6px] border border-white/[0.08] bg-white/[0.05]'
          />
        ))}
      </div>
    );
  }

  if (preview.kind === 'cta') {
    return (
      <div className='mt-8'>
        <div className='h-px w-full bg-[linear-gradient(90deg,transparent,rgba(0,112,243,0.65),transparent)]' />
        <div className='mx-auto mt-5 h-9 w-32 rounded-full border border-white/10 bg-white/[0.12]' />
      </div>
    );
  }

  if (preview.kind === 'grid') {
    return (
      <div className='mt-8 grid grid-cols-2 gap-2'>
        {(preview.chips ?? ['One', 'Two', 'Three', 'Four']).map(chip => (
          <div
            key={chip}
            className='rounded-[7px] border border-white/[0.08] bg-white/[0.045] p-3'
          >
            <div className='h-2 w-14 rounded-full bg-white/16' />
            <div className='mt-5 h-10 rounded-[5px] bg-white/[0.06]' />
          </div>
        ))}
      </div>
    );
  }

  if (preview.kind === 'rail') {
    return (
      <div className='mt-8 flex gap-2 overflow-hidden'>
        {(preview.chips ?? ['One', 'Two', 'Three']).map(chip => (
          <div
            key={chip}
            className='h-28 min-w-32 rounded-[7px] border border-white/[0.08] bg-white/[0.045] p-3'
          >
            <p className='text-[12px] font-medium text-white/58'>{chip}</p>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className='mt-8 rounded-[8px] border border-white/[0.08] bg-white/[0.045] p-4'>
      <div className='flex items-center justify-between gap-4'>
        <div>
          <div className='h-2 w-20 rounded-full bg-white/16' />
          <div className='mt-3 h-2 w-32 rounded-full bg-white/10' />
        </div>
        {preview.metric ? (
          <p className='text-[28px] font-[680] tracking-normal text-white'>
            {preview.metric}
          </p>
        ) : (
          <div className='h-16 w-16 rounded-[7px] bg-white/[0.08]' />
        )}
      </div>
    </div>
  );
}
