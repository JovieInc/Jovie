'use client';

/**
 * Shared row primitives for the chat slash picker and the cmd+k palette.
 *
 * Both surfaces render the same visual row — square or circular artwork on
 * the left, two-line title + subtitle on the right — so the pixel logic
 * lives once and gets composed by `SharedCommandPalette`. Skill icons are
 * mapped from a Lucide name to a component.
 *
 * No keyboard handling here; that's the palette's job. No surface awareness;
 * a row is a row.
 */

import {
  Calendar,
  CheckSquare,
  Image as ImageIcon,
  Link2Off,
  Link as LinkIcon,
  type LucideIcon,
  MessageSquare,
  Music,
  Music2,
  Settings,
  Sparkles,
  UserCircle,
  Users,
} from 'lucide-react';
import Image from 'next/image';
import { memo } from 'react';
import type { EntityKind } from '@/lib/chat/tokens';
import type { EntityRef } from '@/lib/commands/entities';
import type { NavCommand, SkillCommand } from '@/lib/commands/registry';

import { cn } from '@/lib/utils';

const ICON_MAP: Record<string, LucideIcon> = {
  Image: ImageIcon,
  UserCircle,
  Link: LinkIcon,
  Link2Off,
  MessageSquare,
  Music,
  Users,
  CheckSquare,
  Settings,
  Calendar,
};

export interface PickerSkillItem {
  readonly kind: 'skill';
  readonly skill: SkillCommand;
}

export interface PickerEntityItem {
  readonly kind: 'entity';
  readonly entity: EntityRef;
}

export interface PickerNavItem {
  readonly kind: 'nav';
  readonly nav: NavCommand;
}

export interface PickerPromptItem {
  readonly kind: 'prompt';
  readonly prompt: {
    readonly id: string;
    readonly label: string;
    readonly description: string;
    readonly prompt: string;
  };
}

export type PickerItem =
  | PickerSkillItem
  | PickerEntityItem
  | PickerNavItem
  | PickerPromptItem;

function entityKindLabel(kind: EntityKind): string {
  if (kind === 'release') return 'Release';
  if (kind === 'artist') return 'Artist';
  if (kind === 'event') return 'Event';
  return 'Track';
}

export function formatRowMeta(entity: EntityRef): string | null {
  const meta = entity.meta;
  if (!meta) return entityKindLabel(entity.kind);
  if (meta.kind === 'release') return meta.subtitle ?? 'Release';
  if (meta.kind === 'artist') {
    if (meta.handle) return `@${meta.handle}${meta.isYou ? ' · You' : ''}`;
    return meta.subtitle ?? 'Artist';
  }
  return meta.subtitle ?? 'Track';
}

export const ReleaseArt = memo(function ReleaseArt({
  entity,
}: {
  readonly entity: EntityRef;
}) {
  if (entity.thumbnail) {
    return (
      <div className='system-b-picker-art system-b-picker-art-image'>
        <Image
          src={entity.thumbnail}
          alt=''
          fill
          sizes='36px'
          className='object-cover'
          unoptimized
        />
      </div>
    );
  }
  return (
    <div className='system-b-picker-art system-b-picker-art-release-fallback' />
  );
});

export const ArtistArt = memo(function ArtistArt({
  entity,
}: {
  readonly entity: EntityRef;
}) {
  if (entity.thumbnail) {
    return (
      <div className='system-b-picker-art system-b-picker-art-image system-b-picker-art-round'>
        <Image
          src={entity.thumbnail}
          alt=''
          fill
          sizes='36px'
          className='object-cover'
          unoptimized
        />
      </div>
    );
  }
  const initials = entity.label
    .split(/\s+/)
    .slice(0, 2)
    .map(part => part.charAt(0))
    .join('')
    .toUpperCase();
  return (
    <div className='system-b-picker-art system-b-picker-art-round system-b-picker-art-artist-fallback'>
      {initials || '·'}
    </div>
  );
});

export const SkillArt = memo(function SkillArt({
  skill,
}: {
  readonly skill: SkillCommand;
}) {
  const Icon = ICON_MAP[skill.iconName] ?? Calendar;
  return (
    <div className='system-b-picker-art system-b-picker-art-icon'>
      <Icon className='system-b-picker-art-glyph' strokeWidth={1.5} />
    </div>
  );
});

export const NavArt = memo(function NavArt({
  nav,
}: {
  readonly nav: NavCommand;
}) {
  const Icon = ICON_MAP[nav.iconName] ?? Calendar;
  return (
    <div className='system-b-picker-art system-b-picker-art-icon'>
      <Icon className='system-b-picker-art-glyph' strokeWidth={1.5} />
    </div>
  );
});

export const PromptArt = memo(function PromptArt() {
  return (
    <div className='system-b-picker-art system-b-picker-art-icon'>
      <Sparkles className='system-b-picker-art-glyph' strokeWidth={1.5} />
    </div>
  );
});

export const RowVisual = memo(function RowVisual({
  item,
}: {
  readonly item: PickerItem;
}) {
  if (item.kind === 'skill') return <SkillArt skill={item.skill} />;
  if (item.kind === 'nav') return <NavArt nav={item.nav} />;
  if (item.kind === 'prompt') return <PromptArt />;
  if (item.entity.kind === 'release')
    return <ReleaseArt entity={item.entity} />;
  if (item.entity.kind === 'artist') return <ArtistArt entity={item.entity} />;
  if (item.entity.kind === 'event') {
    return (
      <div className='system-b-picker-art system-b-picker-art-icon'>
        <Calendar className='system-b-picker-art-glyph' strokeWidth={1.5} />
      </div>
    );
  }
  return (
    <div className='system-b-picker-art system-b-picker-art-icon'>
      <Music2 className='system-b-picker-art-glyph' strokeWidth={1.5} />
    </div>
  );
});

export const RowBody = memo(function RowBody({
  item,
}: {
  readonly item: PickerItem;
}) {
  if (item.kind === 'skill') {
    return (
      <div className='min-w-0 flex-1'>
        <p className='system-b-picker-row-title'>{item.skill.label}</p>
        <p className='system-b-picker-row-meta'>{item.skill.description}</p>
      </div>
    );
  }
  if (item.kind === 'nav') {
    return (
      <div className='min-w-0 flex-1'>
        <p className='system-b-picker-row-title'>{item.nav.label}</p>
        <p className='system-b-picker-row-meta'>{item.nav.description}</p>
      </div>
    );
  }
  if (item.kind === 'prompt') {
    return (
      <div className='min-w-0 flex-1'>
        <p className='system-b-picker-row-title'>{item.prompt.label}</p>
        <p className='system-b-picker-row-meta'>{item.prompt.description}</p>
      </div>
    );
  }
  const meta = formatRowMeta(item.entity);
  return (
    <div className='min-w-0 flex-1'>
      <p className='system-b-picker-row-title'>{item.entity.label}</p>
      {meta ? <p className='system-b-picker-row-meta'>{meta}</p> : null}
    </div>
  );
});

export function pickerItemKey(item: PickerItem): string {
  if (item.kind === 'skill') return `skill:${item.skill.id}`;
  if (item.kind === 'nav') return `nav:${item.nav.id}`;
  if (item.kind === 'prompt') return `prompt:${item.prompt.id}`;
  return `entity:${item.entity.kind}:${item.entity.id}`;
}

interface PickerRowProps {
  readonly item: PickerItem;
  readonly index: number;
  readonly isActive: boolean;
  readonly onMouseEnter: (index: number) => void;
  readonly onCommit: (index: number) => void;
  /** Optional id used by parent textarea's aria-activedescendant. */
  readonly rowId?: string;
}

export const PickerRow = memo(function PickerRow({
  item,
  index,
  isActive,
  onMouseEnter,
  onCommit,
  rowId,
}: PickerRowProps) {
  return (
    <button
      type='button'
      role='option'
      id={rowId}
      aria-selected={isActive ? 'true' : 'false'}
      aria-current={isActive ? 'true' : undefined}
      onMouseEnter={() => onMouseEnter(index)}
      onMouseDown={e => {
        e.preventDefault();
        onCommit(index);
      }}
      className={cn(
        'system-b-picker-row',
        isActive ? 'system-b-picker-row-active' : 'system-b-picker-row-idle'
      )}
    >
      <RowVisual item={item} />
      <RowBody item={item} />
    </button>
  );
});
