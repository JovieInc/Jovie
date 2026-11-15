import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  ChevronLeft,
  CircleUserRound,
  Image as ImageIcon,
  MessageSquare,
  Music2,
  Plug,
  Search,
} from 'lucide-react';
import { BrandLogo } from '@/components/atoms/BrandLogo';
import { HOMEPAGE_PRODUCT_UI } from '@/data/homepageProductUi';
import { HOME_SPEC, RELEASE_PAGE_SERVICES } from './home-spec';
import { Anchor, Cover, DspGlyph } from './ProductUi';

const PAGE = HOMEPAGE_PRODUCT_UI.releasePage;
const PALETTE = HOMEPAGE_PRODUCT_UI.palette;

/**
 * The release page (VrRlg) for the inspected release; "+N more" follows the
 * registry. The hero shows the same page beside the app, so its title anchor
 * takes another id and the 02 connector still finds the chapter's phone.
 */
export function ReleasePage({
  titleAnchor = 'title',
  eager = false,
}: Readonly<{ titleAnchor?: string; eager?: boolean }> = {}) {
  const more = HOME_SPEC.listen - RELEASE_PAGE_SERVICES.length;
  return (
    <div className='hv3-rp'>
      <div className='hv3-rp__bar'>
        <ChevronLeft className='hv3-ui-i' />
        <span>•••</span>
      </div>
      <span className='hv3-rp__art'>
        <Cover src={PAGE.src} size={300} eager={eager} />
      </span>
      {/* h3: the page sits under its chapter's h2 (axe heading-order). */}
      <h3 className='hv3-rp__title text-balance'>
        <Anchor id={titleAnchor} className='hv3-anchor--before' />
        {PAGE.title}
      </h3>
      <p className='hv3-rp__artist'>{PAGE.artist}</p>
      <ul className='hv3-rp__list'>
        {RELEASE_PAGE_SERVICES.map(glyph => (
          <li key={glyph.key}>
            <span className='hv3-rp__ico'>
              <DspGlyph glyph={glyph} size={16} />
            </span>
            <span>{glyph.name}</span>
            <em>{PAGE.play}</em>
          </li>
        ))}
      </ul>
      <p className='hv3-rp__more'>{PAGE.more(more)}</p>
      <p className='hv3-rp__foot'>
        <BrandLogo size='compact' rounded={false} aria-hidden />
        {PAGE.madeWith}
      </p>
    </div>
  );
}

const PALETTE_ICONS: Readonly<Record<string, LucideIcon>> = {
  profile: CircleUserRound,
  presence: Activity,
  connections: Plug,
  chats: MessageSquare,
  releases: Music2,
  art: ImageIcon,
  pitch: Music2,
};

function PaletteRow({
  row,
}: Readonly<{
  row: (typeof PALETTE.goTo)[number] | (typeof PALETTE.skills)[number];
}>) {
  const Icon = PALETTE_ICONS[row.icon] ?? Music2;
  return (
    <li
      data-hv3-row={row.label}
      data-selected={'selected' in row && row.selected ? 'true' : undefined}
    >
      <Icon className='hv3-pi' />
      <b>{row.label}</b>
      <span>{row.description}</span>
      {'shortcut' in row ? <kbd className='hv3-kbd'>{row.shortcut}</kbd> : null}
    </li>
  );
}

/** The ⌘K command palette (xhH9P runtime capture), set as glass over ion light. */
export function CommandPaletteCard() {
  return (
    <div className='hv3-palette' data-hv3-palette>
      <div className='hv3-palette__search'>
        <Search className='hv3-pi' />
        <span className='hv3-palette__q' data-hv3-query>
          {PALETTE.placeholder}
        </span>
        <kbd className='hv3-kbd'>{HOMEPAGE_PRODUCT_UI.escapeKey}</kbd>
      </div>
      <p className='hv3-palette__group'>{PALETTE.goToLabel}</p>
      <ul>
        {PALETTE.goTo.map(row => (
          <PaletteRow key={row.label} row={row} />
        ))}
      </ul>
      <p className='hv3-palette__group'>{PALETTE.skillsLabel}</p>
      <ul>
        {PALETTE.skills.map(row => (
          <PaletteRow key={row.label} row={row} />
        ))}
      </ul>
    </div>
  );
}

/** Apple dimension-line callout; the client motion layer snaps it to its anchor. */
export function Callout({
  anchor,
  label,
  side = 'right',
  className,
}: Readonly<{
  anchor: string;
  label: string;
  side?: 'left' | 'right';
  className?: string;
}>) {
  return (
    <div
      aria-hidden
      data-hv3-callout={anchor}
      className={[
        'hv3-callout',
        side === 'left' ? 'hv3-callout--l' : '',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <i className='hv3-callout__node' />
      <span className='hv3-callout__leader' />
      <span className='hv3-mono'>{label}</span>
    </div>
  );
}
