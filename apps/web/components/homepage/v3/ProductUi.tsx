import {
  Barcode,
  Bell,
  Building2,
  Calendar,
  Clock,
  Ellipsis,
  House,
  Layers,
  Link2,
  ListMusic,
  PanelLeft,
  Plus,
  Search,
  Tag,
  Users,
  Waypoints,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { BrandLogo } from '@/components/atoms/BrandLogo';
import { ImageryStage } from '@/components/marketing/ImageryStage';
import {
  HOMEPAGE_CATALOG,
  HOMEPAGE_PRODUCT_UI,
  type HomepageCatalogRelease,
} from '@/data/homepageProductUi';
import { cn } from '@/lib/utils';
import { type DspGlyphData, ROW_SERVICES } from './home-spec';

const UI = HOMEPAGE_PRODUCT_UI;
const FIELDS = HOMEPAGE_PRODUCT_UI.inspector.fields;

/** A point inside the 3D rig that a callout or connector tracks. */
export function Anchor({
  id,
  className,
}: Readonly<{ id: string; className: string }>) {
  return (
    <i
      aria-hidden
      className={cn('hv3-anchor', className)}
      data-hv3-anchor={id}
    />
  );
}

export function Cover({
  src,
  size,
  eager = false,
  className,
}: Readonly<{
  src: string;
  size: number;
  eager?: boolean;
  className?: string;
}>) {
  return (
    <ImageryStage
      src={src}
      alt=''
      width={size}
      height={size}
      sizes={`${size * 2}px`}
      loading={eager ? 'eager' : 'lazy'}
      className={cn('hv3-cover', className)}
    />
  );
}

/**
 * A registry DSP logo, drawn from its path data in the surrounding ink. The
 * homepage sets every service in one tone, so colour never competes with
 * the product (Tim, 2026-11-08: "premium not consumer").
 */
export function DspGlyph({
  glyph,
  size,
}: Readonly<{ glyph: DspGlyphData; size: number }>) {
  return (
    <svg aria-hidden viewBox={glyph.viewBox} width={size} height={size}>
      <path fill='currentColor' d={glyph.path} />
    </svg>
  );
}

function RowServices() {
  return (
    <div className='hv3-rrow__p'>
      {ROW_SERVICES.map(glyph => (
        <i key={glyph.key} className='hv3-dsp'>
          <DspGlyph glyph={glyph} size={12} />
        </i>
      ))}
    </div>
  );
}

function ReleaseTitle({
  release,
}: Readonly<{ release: HomepageCatalogRelease }>) {
  return (
    <div className='hv3-rrow__t'>
      <b>{release.title}</b>
      <span>{release.byline}</span>
    </div>
  );
}

const SIDEBAR_NAV = [
  { label: 'Home', Icon: House },
  { label: 'Presence', Icon: Waypoints },
  { label: 'Links', Icon: Link2 },
  { label: 'Audience', Icon: Users },
] as const;

/** Jovie for Mac: sidebar plus the Releases list, the inspected release selected. */
export function AppWindow() {
  return (
    <div className='hv3-app'>
      <div className='hv3-app__bar'>
        <i />
        <i />
        <i />
      </div>
      <div className='hv3-app__body'>
        <aside className='hv3-side'>
          <div className='hv3-side__top'>
            <BrandLogo
              size='chrome'
              rounded={false}
              aria-hidden
              className='hv3-side__mark'
            />
            <PanelLeft className='hv3-ui-i' />
          </div>
          <div className='hv3-side__search'>
            <Search className='hv3-ui-i' />
            <span>{UI.searchChats}</span>
          </div>
          <div className='hv3-side__inbox'>
            <Bell className='hv3-ui-i' />
            <span>{UI.inbox}</span>
            <em className='hv3-side__count'>3</em>
            <b className='hv3-side__new'>
              <Plus className='hv3-ui-i' />
            </b>
          </div>
          <div className='hv3-side__nav'>
            {SIDEBAR_NAV.map(({ label, Icon }) => (
              <span key={label}>
                <Icon className='hv3-ui-i' />
                {label}
              </span>
            ))}
          </div>
        </aside>
        <div className='hv3-main'>
          <header className='hv3-main__head'>
            <b>{UI.releases}</b>
            <span className='tabular-nums'>{UI.releaseCount}</span>
            <div className='hv3-main__search'>
              {UI.searchCommand}
              <kbd className='hv3-kbd'>⌘K</kbd>
            </div>
          </header>
          <div className='hv3-main__cols'>
            <span>{UI.columns.title}</span>
            <span>{UI.columns.platforms}</span>
            <span>{UI.columns.released}</span>
          </div>
          {HOMEPAGE_CATALOG.map(release => (
            <div
              key={release.title}
              className='hv3-rrow'
              data-selected={release.selected ? 'true' : undefined}
            >
              <Cover src={release.src} size={40} eager />
              <ReleaseTitle release={release} />
              <RowServices />
              <span className='hv3-rrow__y'>{release.year}</span>
              <Ellipsis className='hv3-ui-i hv3-rrow__m' />
            </div>
          ))}
        </div>
        <div className='hv3-app__slot' />
      </div>
    </div>
  );
}

function InspectorRow({
  icon,
  label,
  gap = false,
  children,
}: Readonly<{
  icon: ReactNode;
  label: string;
  gap?: boolean;
  children: ReactNode;
}>) {
  return (
    <div data-gap={gap ? 'true' : undefined}>
      {icon}
      <dt>{label}</dt>
      {children}
    </div>
  );
}

/** The release inspector (z7lmbm) for the inspected release, Details tab. */
export function ReleaseInspector({
  anchor,
  eager = false,
}: Readonly<{ anchor: string; eager?: boolean }>) {
  const release = UI.inspector;
  return (
    <div className='hv3-insp'>
      <div className='hv3-insp__head'>
        <Cover src={release.src} size={56} eager={eager} />
        <div>
          <b>{release.title}</b>
          <span>{release.artist}</span>
        </div>
        <Ellipsis className='hv3-ui-i hv3-insp__more' />
      </div>
      <div className='hv3-insp__tabs'>
        {release.tabs.map((tab, index) => (
          <span key={tab} data-active={index === 0 ? 'true' : undefined}>
            {tab}
          </span>
        ))}
      </div>
      <dl className='hv3-insp__rows'>
        <InspectorRow
          icon={<Calendar className='hv3-ui-i' />}
          label={FIELDS.date}
        >
          <dd>{release.date}</dd>
        </InspectorRow>
        <InspectorRow
          icon={<Layers className='hv3-ui-i' />}
          label={FIELDS.type}
        >
          <dd>
            <em className='hv3-chip hv3-chip--line'>{release.type}</em>
          </dd>
        </InspectorRow>
        <InspectorRow
          icon={<ListMusic className='hv3-ui-i' />}
          label={FIELDS.tracks}
        >
          <dd>{release.tracks}</dd>
        </InspectorRow>
        <InspectorRow
          icon={<Clock className='hv3-ui-i' />}
          label={FIELDS.duration}
        >
          <dd>{release.duration}</dd>
        </InspectorRow>
        <InspectorRow
          gap
          icon={<Tag className='hv3-ui-i' />}
          label={FIELDS.genres}
        >
          <dd>
            {release.genres.map(genre => (
              <em key={genre} className='hv3-chip'>
                {genre}
              </em>
            ))}
          </dd>
        </InspectorRow>
        <InspectorRow
          icon={<Building2 className='hv3-ui-i' />}
          label={FIELDS.label}
        >
          <dd>{release.label}</dd>
        </InspectorRow>
        <InspectorRow
          gap
          icon={<Barcode className='hv3-ui-i' />}
          label={FIELDS.upc}
        >
          <dd className='hv3-upc'>
            {release.upc}
            <Anchor id={anchor} className='hv3-anchor--after' />
          </dd>
        </InspectorRow>
      </dl>
    </div>
  );
}

/** The Releases surface as a plate, cropped before the search field. */
export function CatalogPlate() {
  return (
    <div className='hv3-main hv3-main--plate'>
      <header className='hv3-main__head'>
        <b>{UI.releases}</b>
        <span className='tabular-nums'>{UI.releaseCount}</span>
      </header>
      <div className='hv3-main__cols hv3-main__cols--plate'>
        <span>{UI.columns.title}</span>
        <span>{UI.columns.platforms}</span>
      </div>
      {HOMEPAGE_CATALOG.map(release => (
        <div
          key={release.title}
          className='hv3-rrow hv3-rrow--plate'
          data-selected={release.selected ? 'true' : undefined}
        >
          <Cover src={release.src} size={40} />
          <ReleaseTitle release={release} />
          <RowServices />
          {release.selected ? (
            <Anchor id='rowR' className='hv3-anchor--row-end' />
          ) : null}
        </div>
      ))}
    </div>
  );
}
