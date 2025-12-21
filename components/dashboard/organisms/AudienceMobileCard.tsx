'use client';

import { Badge, Checkbox } from '@jovie/ui';
import { ChevronDown, ChevronUp, MapPin } from 'lucide-react';
import { useState } from 'react';
import { Icon } from '@/components/atoms/Icon';
import { AudienceIntentBadge } from '@/components/dashboard/atoms/AudienceIntentBadge';
import { cn } from '@/lib/utils';
import {
  formatLongDate,
  formatTimeAgo,
  getDeviceIndicator,
} from '@/lib/utils/audience';
import type { AudienceMember } from '@/types';

function resolveAudienceActionIcon(label: string): string {
  const normalized = label.trim().toLowerCase();
  if (normalized.includes('visit')) return 'Eye';
  if (normalized.includes('view')) return 'Eye';
  if (normalized.includes('tip')) return 'HandCoins';
  if (normalized.includes('purchase')) return 'CreditCard';
  if (normalized.includes('subscribe')) return 'Bell';
  if (normalized.includes('follow')) return 'UserPlus';
  if (normalized.includes('click')) return 'MousePointerClick';
  if (normalized.includes('link')) return 'Link';
  return 'Sparkles';
}

export interface AudienceMobileCardProps {
  member: AudienceMember;
  isSelected: boolean;
  onSelect: () => void;
  onCardClick: () => void;
  mode: 'members' | 'subscribers';
}

export function AudienceMobileCard({
  member,
  isSelected,
  onSelect,
  onCardClick,
  mode,
}: AudienceMobileCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const deviceIndicator = getDeviceIndicator(member.deviceType);

  const displayName = member.displayName || 'Visitor';
  const subtitle =
    member.type === 'anonymous'
      ? null
      : member.type === 'email'
        ? (member.email ?? 'Email fan')
        : member.type === 'sms'
          ? (member.phone ?? 'SMS fan')
          : 'Connected fan';

  return (
    <div
      className={cn(
        'bg-surface-0 border border-subtle rounded-xl overflow-hidden transition-colors',
        isSelected && 'border-accent/50 bg-surface-1'
      )}
    >
      {/* Main card content - always visible */}
      <div className='p-4'>
        {/* Header row with checkbox, name, and expand button */}
        <div className='flex items-start gap-3'>
          {/* Checkbox */}
          <div
            className='pt-0.5'
            onClick={e => {
              e.stopPropagation();
              onSelect();
            }}
          >
            <Checkbox
              aria-label={`Select ${displayName}`}
              checked={isSelected}
              onCheckedChange={onSelect}
            />
          </div>

          {/* Main content - clickable to open sidebar */}
          <div
            className='flex-1 min-w-0 cursor-pointer'
            onClick={onCardClick}
            role='button'
            tabIndex={0}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onCardClick();
              }
            }}
          >
            <div className='flex items-start justify-between gap-2'>
              <div className='min-w-0 flex-1'>
                <h3 className='font-semibold text-primary-token truncate text-base'>
                  {displayName}
                </h3>
                {subtitle && (
                  <p className='text-sm text-secondary-token truncate mt-0.5'>
                    {subtitle}
                  </p>
                )}
              </div>
              {mode === 'members' && (
                <AudienceIntentBadge
                  intentLevel={member.intentLevel}
                  className='flex-shrink-0'
                />
              )}
            </div>

            {/* Quick info row */}
            <div className='flex flex-wrap items-center gap-2 mt-3'>
              {mode === 'members' ? (
                <>
                  <Badge size='sm' variant='secondary' className='capitalize'>
                    {member.type}
                  </Badge>
                  <span className='text-xs text-secondary-token flex items-center gap-1'>
                    <MapPin className='h-3 w-3' />
                    {member.locationLabel || 'Unknown'}
                  </span>
                  {deviceIndicator && (
                    <span className='text-xs text-secondary-token flex items-center gap-1'>
                      <Icon
                        name={deviceIndicator.iconName}
                        className='h-3 w-3'
                        aria-label={deviceIndicator.label}
                      />
                    </span>
                  )}
                  <span className='text-xs text-tertiary-token'>
                    {formatTimeAgo(member.lastSeenAt)}
                  </span>
                </>
              ) : (
                <>
                  {member.email && (
                    <span className='text-xs text-secondary-token truncate max-w-[200px]'>
                      {member.email}
                    </span>
                  )}
                  {member.phone && (
                    <span className='text-xs text-secondary-token'>
                      {member.phone}
                    </span>
                  )}
                  <span className='text-xs text-tertiary-token'>
                    {formatLongDate(member.lastSeenAt)}
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Expand button */}
          <button
            type='button'
            onClick={e => {
              e.stopPropagation();
              setIsExpanded(!isExpanded);
            }}
            className='flex-shrink-0 p-2 -mr-2 text-secondary-token hover:text-primary-token transition-colors'
            aria-expanded={isExpanded}
            aria-label={isExpanded ? 'Show less details' : 'Show more details'}
          >
            {isExpanded ? (
              <ChevronUp className='h-4 w-4' />
            ) : (
              <ChevronDown className='h-4 w-4' />
            )}
          </button>
        </div>
      </div>

      {/* Expanded content */}
      {isExpanded && (
        <div className='border-t border-subtle bg-surface-1/50 px-4 py-3 space-y-3'>
          {mode === 'members' ? (
            <>
              {/* Visits & Intent */}
              <div className='flex items-center gap-3'>
                <div className='w-20 flex-shrink-0 text-xs text-tertiary-token font-medium'>
                  Visits
                </div>
                <div className='flex items-center gap-2'>
                  <span className='text-sm font-semibold text-primary-token'>
                    {member.visits}
                  </span>
                  <AudienceIntentBadge intentLevel={member.intentLevel} />
                </div>
              </div>

              {/* Location */}
              <div className='flex items-start gap-3'>
                <div className='w-20 flex-shrink-0 text-xs text-tertiary-token font-medium'>
                  Location
                </div>
                <span className='text-sm text-secondary-token'>
                  {member.locationLabel || 'Unknown'}
                </span>
              </div>

              {/* Device */}
              {deviceIndicator && (
                <div className='flex items-start gap-3'>
                  <div className='w-20 flex-shrink-0 text-xs text-tertiary-token font-medium'>
                    Device
                  </div>
                  <div className='flex items-center gap-2 text-sm text-secondary-token'>
                    <Icon
                      name={deviceIndicator.iconName}
                      className='h-4 w-4'
                      aria-hidden='true'
                    />
                    <span>{deviceIndicator.label}</span>
                  </div>
                </div>
              )}

              {/* Recent Actions */}
              {member.latestActions.length > 0 && (
                <div className='flex items-start gap-3'>
                  <div className='w-20 flex-shrink-0 text-xs text-tertiary-token font-medium pt-1'>
                    Actions
                  </div>
                  <div className='flex flex-wrap gap-1.5'>
                    {member.latestActions.slice(0, 4).map((action, idx) => {
                      const iconName = resolveAudienceActionIcon(action.label);
                      return (
                        <span
                          key={`${member.id}-${action.label}-${action.platform ?? 'unknown'}-${idx}`}
                          className='inline-flex h-7 w-7 items-center justify-center rounded-full border border-subtle bg-surface-2/40 text-tertiary-token'
                          title={action.label}
                        >
                          <Icon
                            name={iconName}
                            className='h-3.5 w-3.5'
                            aria-hidden='true'
                          />
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Email if available */}
              {member.email && (
                <div className='flex items-start gap-3'>
                  <div className='w-20 flex-shrink-0 text-xs text-tertiary-token font-medium'>
                    Email
                  </div>
                  <span className='text-sm text-secondary-token truncate'>
                    {member.email}
                  </span>
                </div>
              )}

              {/* Phone if available */}
              {member.phone && (
                <div className='flex items-start gap-3'>
                  <div className='w-20 flex-shrink-0 text-xs text-tertiary-token font-medium'>
                    Phone
                  </div>
                  <span className='text-sm text-secondary-token'>
                    {member.phone}
                  </span>
                </div>
              )}
            </>
          ) : (
            <>
              {/* Subscriber mode - show contact details */}
              {member.email && (
                <div className='flex items-start gap-3'>
                  <div className='w-20 flex-shrink-0 text-xs text-tertiary-token font-medium'>
                    Email
                  </div>
                  <span className='text-sm text-secondary-token truncate'>
                    {member.email}
                  </span>
                </div>
              )}

              {member.phone && (
                <div className='flex items-start gap-3'>
                  <div className='w-20 flex-shrink-0 text-xs text-tertiary-token font-medium'>
                    Phone
                  </div>
                  <span className='text-sm text-secondary-token'>
                    {member.phone}
                  </span>
                </div>
              )}

              {member.geoCountry && (
                <div className='flex items-start gap-3'>
                  <div className='w-20 flex-shrink-0 text-xs text-tertiary-token font-medium'>
                    Country
                  </div>
                  <span className='text-sm text-secondary-token'>
                    {member.geoCountry}
                  </span>
                </div>
              )}

              <div className='flex items-start gap-3'>
                <div className='w-20 flex-shrink-0 text-xs text-tertiary-token font-medium'>
                  Signed up
                </div>
                <span className='text-sm text-secondary-token'>
                  {formatLongDate(member.lastSeenAt)}
                </span>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
