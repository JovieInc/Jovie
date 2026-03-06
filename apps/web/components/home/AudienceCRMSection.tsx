import {
  ArrowUpRight,
  DollarSign,
  Globe,
  Mail,
  MapPin,
  Users,
} from 'lucide-react';
import { Container } from '@/components/site/Container';

/* ------------------------------------------------------------------ */
/*  Mock CRM table data — matches real audience table patterns          */
/* ------------------------------------------------------------------ */

type IntentLevel = 'high' | 'medium' | 'low';

const INTENT_DOT_COLORS: Record<IntentLevel, string> = {
  high: '#22c55e',
  medium: '#fbbf24',
  low: '#a1a1aa',
};

const INTENT_TEXT_COLORS: Record<IntentLevel, string> = {
  high: '#4ade80',
  medium: '#fbbf24',
  low: 'var(--linear-text-tertiary)',
};

const MOCK_FANS = [
  {
    id: 1,
    name: 'Sarah M.',
    email: 'sarah.m***@gmail.com',
    city: 'Los Angeles, CA',
    source: 'Instagram',
    intent: 'high' as IntentLevel,
    visits: 12,
    tipAmount: '$5.00',
    joinedAt: '2 days ago',
  },
  {
    id: 2,
    name: 'Jake T.',
    email: 'jake.t***@outlook.com',
    city: 'Nashville, TN',
    source: 'TikTok',
    intent: 'medium' as IntentLevel,
    visits: 3,
    tipAmount: null,
    joinedAt: '4 days ago',
  },
  {
    id: 3,
    name: 'Priya K.',
    email: 'priya.k***@yahoo.com',
    city: 'London, UK',
    source: 'Spotify',
    intent: 'high' as IntentLevel,
    visits: 8,
    tipAmount: '$10.00',
    joinedAt: '1 week ago',
  },
  {
    id: 4,
    name: 'Carlos R.',
    email: 'carlos.r***@gmail.com',
    city: 'Mexico City, MX',
    source: 'Direct link',
    intent: 'high' as IntentLevel,
    visits: 15,
    tipAmount: '$3.00',
    joinedAt: '1 week ago',
  },
  {
    id: 5,
    name: 'Emma L.',
    email: 'emma.l***@icloud.com',
    city: 'Berlin, DE',
    source: 'Twitter',
    intent: 'low' as IntentLevel,
    visits: 1,
    tipAmount: null,
    joinedAt: '2 weeks ago',
  },
];

/* ------------------------------------------------------------------ */
/*  Stat cards shown above the table                                    */
/* ------------------------------------------------------------------ */

const STATS = [
  { label: 'Total fans', value: '2,847', icon: Users },
  { label: 'Emails captured', value: '2,341', icon: Mail },
  { label: 'Cities reached', value: '189', icon: MapPin },
  { label: 'Tips earned', value: '$1,204', icon: DollarSign },
];

/* ------------------------------------------------------------------ */
/*  AudienceCRMSection                                                  */
/* ------------------------------------------------------------------ */

export function AudienceCRMSection() {
  return (
    <section className='section-spacing-linear overflow-hidden bg-[var(--linear-bg-page)]'>
      <Container size='homepage'>
        <div className='mx-auto max-w-[var(--linear-content-max)]'>
          {/* Header */}
          <div className='grid md:grid-cols-2 md:items-start section-gap-linear'>
            <h2 className='max-w-md marketing-h2-linear text-[var(--linear-text-primary)]'>
              Your audience.
              <br />
              Finally yours.
            </h2>
            <div className='max-w-lg'>
              <p className='marketing-lead-linear text-[var(--linear-text-secondary)]'>
                Every visit captures an email, a city, a referral source. No
                integrations, no extra tools — just a CRM that fills itself.
              </p>
              <span className='mt-6 inline-flex items-center gap-1.5 rounded-full px-3 py-1 border transition-colors text-[var(--linear-caption-size)] font-[var(--linear-font-weight-medium)] text-[var(--linear-text-primary)] bg-[var(--linear-bg-surface-1)] border-[var(--linear-border-default)]'>
                Built-in CRM
              </span>
            </div>
          </div>

          {/* Product demo */}
          <div className='relative mt-8 md:mt-12 mx-auto w-full'>
            {/* Dashboard window */}
            <div
              className='relative overflow-hidden rounded-xl md:rounded-2xl'
              style={{
                border: '1px solid var(--linear-border-subtle)',
                backgroundColor: 'var(--linear-bg-surface-0)',
                boxShadow: 'var(--linear-shadow-card-elevated)',
              }}
            >
              {/* Mac window chrome */}
              <div className='flex items-center px-5 h-12 border-b border-[var(--linear-border-subtle)] bg-[var(--linear-bg-surface-1)]'>
                <div className='flex gap-2'>
                  <div className='w-3 h-3 rounded-full bg-[#ED6A5E] border border-black/10' />
                  <div className='w-3 h-3 rounded-full bg-[#F4BF4F] border border-black/10' />
                  <div className='w-3 h-3 rounded-full bg-[#61C554] border border-black/10' />
                </div>
                <div className='flex-1 text-center text-[var(--linear-caption-size)] text-[var(--linear-text-tertiary)]'>
                  Audience
                </div>
                <div className='w-[52px]' />
              </div>

              {/* Stat cards */}
              <div className='grid grid-cols-2 md:grid-cols-4 gap-px bg-[var(--linear-border-subtle)]'>
                {STATS.map(stat => (
                  <div
                    key={stat.label}
                    className='flex items-center gap-3 px-5 py-4 bg-[var(--linear-bg-surface-0)]'
                  >
                    <div className='flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--linear-bg-surface-2)]'>
                      <stat.icon
                        className='h-4 w-4 text-[var(--linear-text-secondary)]'
                        aria-hidden='true'
                      />
                    </div>
                    <div className='min-w-0'>
                      <p className='text-[var(--linear-label-size)] text-[var(--linear-text-tertiary)]'>
                        {stat.label}
                      </p>
                      <p className='text-[var(--linear-caption-size)] font-[var(--linear-font-weight-medium)] text-[var(--linear-text-primary)]'>
                        {stat.value}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Fans table */}
              <FansTable />

              {/* Bottom gradient fade */}
              <div className='pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-linear-to-t from-[var(--linear-bg-surface-0)] to-transparent' />
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Fans Table — matches real DashboardAudienceTableUnified patterns    */
/* ------------------------------------------------------------------ */

function FansTable() {
  return (
    <div className='bg-[var(--linear-bg-surface-0)]'>
      {/* Table header */}
      <div className='flex items-center justify-between border-b border-[var(--linear-border-subtle)] px-5 py-3'>
        <div className='flex items-center gap-2'>
          <span className='text-[var(--linear-caption-size)] font-[var(--linear-font-weight-medium)] text-[var(--linear-text-primary)]'>
            Recent fans
          </span>
          <span className='rounded-full px-2 py-0.5 text-[var(--linear-label-size)] font-[var(--linear-font-weight-medium)] text-[var(--linear-text-secondary)] bg-[var(--linear-bg-surface-2)]'>
            {MOCK_FANS.length}
          </span>
        </div>
        <div className='flex items-center gap-1 text-[var(--linear-label-size)] text-[var(--linear-text-tertiary)]'>
          <span>View all</span>
          <ArrowUpRight className='h-3 w-3' aria-hidden='true' />
        </div>
      </div>

      {/* Column headers — matches real audience table columns */}
      <div className='grid grid-cols-[1fr_auto_auto_auto_auto_auto] items-center gap-4 border-b border-[var(--linear-border-subtle)] px-5 py-2'>
        <span className='text-[var(--linear-label-size)] font-[var(--linear-font-weight-medium)] uppercase tracking-[0.05em] text-[var(--linear-text-tertiary)]'>
          Visitor
        </span>
        <span className='text-[var(--linear-label-size)] font-[var(--linear-font-weight-medium)] uppercase tracking-[0.05em] text-[var(--linear-text-tertiary)] hidden sm:block'>
          Intent
        </span>
        <span className='text-[var(--linear-label-size)] font-[var(--linear-font-weight-medium)] uppercase tracking-[0.05em] text-[var(--linear-text-tertiary)] hidden md:block'>
          Returning
        </span>
        <span className='text-[var(--linear-label-size)] font-[var(--linear-font-weight-medium)] uppercase tracking-[0.05em] text-[var(--linear-text-tertiary)] hidden md:block'>
          Source
        </span>
        <span className='text-[var(--linear-label-size)] font-[var(--linear-font-weight-medium)] uppercase tracking-[0.05em] text-[var(--linear-text-tertiary)] hidden sm:block'>
          Location
        </span>
        <span className='text-[var(--linear-label-size)] font-[var(--linear-font-weight-medium)] uppercase tracking-[0.05em] text-[var(--linear-text-tertiary)]'>
          LTV
        </span>
      </div>

      {/* Rows */}
      {MOCK_FANS.map((fan, i) => (
        <div
          key={fan.id}
          className='grid grid-cols-[1fr_auto_auto_auto_auto_auto] items-center gap-4 px-5 py-3 transition-colors hover:bg-[var(--linear-bg-hover)]'
          style={{
            borderBottom:
              i < MOCK_FANS.length - 1
                ? '1px solid var(--linear-border-subtle)'
                : undefined,
          }}
        >
          {/* Name + email */}
          <div className='min-w-0'>
            <p className='truncate text-[var(--linear-caption-size)] font-[var(--linear-font-weight-medium)] text-[var(--linear-text-primary)]'>
              {fan.name}
            </p>
            <p className='mt-0.5 truncate text-[var(--linear-label-size)] text-[var(--linear-text-tertiary)]'>
              {fan.email}
            </p>
          </div>

          {/* Intent — dot + colored label (matches AudienceIntentScoreCell) */}
          <div className='hidden sm:flex items-center gap-2 text-[13px]'>
            <span
              className='inline-block size-1.5 shrink-0 rounded-full'
              style={{ backgroundColor: INTENT_DOT_COLORS[fan.intent] }}
              aria-hidden='true'
            />
            <span
              className='text-[var(--linear-label-size)]'
              style={{
                color: INTENT_TEXT_COLORS[fan.intent],
                fontWeight:
                  fan.intent === 'high'
                    ? 600
                    : fan.intent === 'medium'
                      ? 500
                      : 400,
              }}
            >
              {fan.intent.charAt(0).toUpperCase() + fan.intent.slice(1)}
            </span>
          </div>

          {/* Returning — Yes/No badge (matches AudienceReturningCell) */}
          <span className='hidden md:inline-flex text-[var(--linear-label-size)] text-[var(--linear-text-secondary)]'>
            {fan.visits > 1 ? 'Yes' : 'No'}
          </span>

          {/* Source — pill badge */}
          <span className='hidden md:inline-flex rounded-full px-2 py-0.5 text-[var(--linear-label-size)] font-[var(--linear-font-weight-medium)] text-[var(--linear-text-secondary)] bg-[var(--linear-bg-surface-2)]'>
            {fan.source}
          </span>

          {/* Location */}
          <span className='hidden sm:inline-flex items-center gap-1 text-[var(--linear-label-size)] text-[var(--linear-text-tertiary)]'>
            <Globe className='h-3 w-3 shrink-0' aria-hidden='true' />
            {fan.city}
          </span>

          {/* LTV / Tip amount */}
          {fan.tipAmount ? (
            <span
              className='inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-[var(--linear-font-weight-medium)]'
              style={{
                color: 'var(--linear-success)',
                backgroundColor:
                  'oklch(from var(--linear-success) l c h / 0.12)',
              }}
            >
              <DollarSign className='h-3 w-3' aria-hidden='true' />
              {fan.tipAmount}
            </span>
          ) : (
            <span className='inline-flex rounded-full px-2 py-0.5 text-[10px] font-[var(--linear-font-weight-medium)] text-[var(--linear-text-tertiary)] bg-[var(--linear-bg-surface-2)]'>
              --
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
