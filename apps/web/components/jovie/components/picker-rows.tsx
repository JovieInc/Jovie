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
  UserCircle,
  Users,
} from 'lucide-react';
import Image from 'next/image';
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

export type PickerItem = PickerSkillItem | PickerEntityItem | PickerNavItem;

function entityKindLabel(kind: EntityKind): string {
  if (kind === 'release') return 'Release';
  if (kind === 'artist') return 'Artist';
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

export function ReleaseArt({ entity }: { readonly entity: EntityRef }) {
  if (entity.thumbnail) {
    return (
      <div className='relative h-9 w-9 shrink-0 overflow-hidden rounded-md shadow-[inset_0_0_0_0.5px_rgba(255,255,255,0.05)]'>
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
    <div className='h-9 w-9 shrink-0 rounded-md bg-gradient-to-br from-[#2a2a2f] to-[#16161a] shadow-[inset_0_0_0_0.5px_rgba(255,255,255,0.05)]' />
  );
}

export function ArtistArt({ entity }: { readonly entity: EntityRef }) {
  if (entity.thumbnail) {
    return (
      <div className='relative h-9 w-9 shrink-0 overflow-hidden rounded-full shadow-[inset_0_0_0_0.5px_rgba(255,255,255,0.05)]'>
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
    <div className='flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#3a3a40] to-[#1a1a1d] text-[12px] font-semibold tracking-[-0.01em] text-primary-token shadow-[inset_0_0_0_0.5px_rgba(255,255,255,0.05)]'>
      {initials || '·'}
    </div>
  );
}

export function SkillArt({ skill }: { readonly skill: SkillCommand }) {
  const Icon = ICON_MAP[skill.iconName] ?? Calendar;
  return (
    <div className='flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-gradient-to-b from-[#25252a] to-[#1c1c20] text-secondary-token shadow-[inset_0_0.5px_0_rgba(255,255,255,0.06),inset_0_0_0_0.5px_rgba(255,255,255,0.04)]'>
      <Icon className='h-[14px] w-[14px]' strokeWidth={1.5} />
    </div>
  );
}

export function NavArt({ nav }: { readonly nav: NavCommand }) {
  const Icon = ICON_MAP[nav.iconName] ?? Calendar;
  return (
    <div className='flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-gradient-to-b from-[#25252a] to-[#1c1c20] text-secondary-token shadow-[inset_0_0.5px_0_rgba(255,255,255,0.06),inset_0_0_0_0.5px_rgba(255,255,255,0.04)]'>
      <Icon className='h-[14px] w-[14px]' strokeWidth={1.5} />
    </div>
  );
}

export function RowVisual({ item }: { readonly item: PickerItem }) {
  if (item.kind === 'skill') return <SkillArt skill={item.skill} />;
  if (item.kind === 'nav') return <NavArt nav={item.nav} />;
  if (item.entity.kind === 'release')
    return <ReleaseArt entity={item.entity} />;
  if (item.entity.kind === 'artist') return <ArtistArt entity={item.entity} />;
  return (
    <div className='flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-gradient-to-b from-[#25252a] to-[#1c1c20] text-secondary-token shadow-[inset_0_0_0_0.5px_rgba(255,255,255,0.05)]'>
      <Music2 className='h-[14px] w-[14px]' strokeWidth={1.5} />
    </div>
  );
}

export function RowBody({ item }: { readonly item: PickerItem }) {
  if (item.kind === 'skill') {
    return (
      <div className='min-w-0 flex-1'>
        <p className='truncate text-[13.5px] font-medium leading-tight tracking-[-0.005em] text-primary-token'>
          {item.skill.label}
        </p>
        <p className='mt-[3px] truncate text-[11.5px] text-tertiary-token'>
          {item.skill.description}
        </p>
      </div>
    );
  }
  if (item.kind === 'nav') {
    return (
      <div className='min-w-0 flex-1'>
        <p className='truncate text-[13.5px] font-medium leading-tight tracking-[-0.005em] text-primary-token'>
          {item.nav.label}
        </p>
        <p className='mt-[3px] truncate text-[11.5px] text-tertiary-token'>
          {item.nav.description}
        </p>
      </div>
    );
  }
  const meta = formatRowMeta(item.entity);
  return (
    <div className='min-w-0 flex-1'>
      <p className='truncate text-[13.5px] font-medium leading-tight tracking-[-0.005em] text-primary-token'>
        {item.entity.label}
      </p>
      {meta ? (
        <p className='mt-[3px] truncate text-[11.5px] text-tertiary-token'>
          {meta}
        </p>
      ) : null}
    </div>
  );
}

export function pickerItemKey(item: PickerItem): string {
  if (item.kind === 'skill') return `skill:${item.skill.id}`;
  if (item.kind === 'nav') return `nav:${item.nav.id}`;
  return `entity:${item.entity.kind}:${item.entity.id}`;
}

interface PickerRowProps {
  readonly item: PickerItem;
  readonly index: number;
  readonly isActive: boolean;
  readonly onMouseEnter: (index: number) => void;
  readonly onCommit: (index: number) => void;
}

export function PickerRow({
  item,
  index,
  isActive,
  onMouseEnter,
  onCommit,
}: PickerRowProps) {
  return (
    <button
      type='button'
      role='menuitem'
      aria-current={isActive ? 'true' : undefined}
      onMouseEnter={() => onMouseEnter(index)}
      onMouseDown={e => {
        e.preventDefault();
        onCommit(index);
      }}
      className={cn(
        'flex w-full items-center gap-[10px] rounded-lg px-[9px] py-[7px] text-left transition-colors duration-fast',
        isActive
          ? 'bg-white/[0.06] shadow-[inset_0_0_0_0.5px_rgba(255,255,255,0.05)]'
          : 'hover:bg-white/[0.035]'
      )}
    >
      <RowVisual item={item} />
      <RowBody item={item} />
    </button>
  );
}
