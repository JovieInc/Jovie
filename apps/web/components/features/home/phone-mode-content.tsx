/**
 * Shared phone mode content for the marketing homepage.
 *
 * Used by both HeroProfilePreview (hero auto-advancing phone) and
 * DeeplinksGrid (scroll-driven phone) to avoid code duplication.
 */

import { TIM_WHITE_PROFILE } from '@/lib/tim-white';

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

export const MOCK_ARTIST = {
  name: TIM_WHITE_PROFILE.name,
  handle: TIM_WHITE_PROFILE.handle,
  image: TIM_WHITE_PROFILE.avatarSrc,
  isVerified: true,
} as const;

export const PHONE_CONTENT_HEIGHT = 196;
export const FALLBACK_CITY = 'Los Angeles';
export const FALLBACK_REGION = 'CA';

const TOUR_VENUES_BY_CITY = {
  'los angeles': ['Academy LA', 'Avalon Hollywood'],
  'new york': ['Brooklyn Steel', 'Webster Hall'],
  nashville: ['Exit/In', 'Marathon Music Works'],
  austin: ['Mohawk', "Emo's"],
  philadelphia: ['The TLA', 'Union Transfer'],
  richmond: ['The National'],
  atlanta: ['The Masquerade', 'Terminal West'],
  chicago: ['Metro', 'Thalia Hall'],
  denver: ['Gothic Theatre', 'Bluebird Theater'],
  toronto: ['The Danforth', 'Velvet Underground'],
  london: ['Village Underground', 'Electric Brixton'],
} as const;

const CITY_ALIASES: Record<string, keyof typeof TOUR_VENUES_BY_CITY> = {
  la: 'los angeles',
  'los angeles': 'los angeles',
  'new york city': 'new york',
  nyc: 'new york',
  philly: 'philadelphia',
};

const CITY_DISPLAY_NAMES: Record<keyof typeof TOUR_VENUES_BY_CITY, string> = {
  'los angeles': 'Los Angeles',
  'new york': 'New York',
  nashville: 'Nashville',
  austin: 'Austin',
  philadelphia: 'Philadelphia',
  richmond: 'Richmond',
  atlanta: 'Atlanta',
  chicago: 'Chicago',
  denver: 'Denver',
  toronto: 'Toronto',
  london: 'London',
};

const formatCityKey = (city: string): string => city.trim().toLowerCase();

const resolveCityKey = (
  city: string
): keyof typeof TOUR_VENUES_BY_CITY | null => {
  const normalized = formatCityKey(city);
  if (normalized in TOUR_VENUES_BY_CITY) {
    return normalized as keyof typeof TOUR_VENUES_BY_CITY;
  }
  return CITY_ALIASES[normalized] ?? null;
};

export interface TourPersonalizationInput {
  city?: string | null;
  region?: string | null;
  artistCity?: string | null;
}

export interface TourPersonalization {
  city: string;
  region: string;
  venue: string;
}

export function getTourPersonalization({
  city,
  region,
  artistCity,
}: TourPersonalizationInput): TourPersonalization {
  const preferredCity = artistCity?.trim() || city?.trim() || '';
  const cityKey = preferredCity ? resolveCityKey(preferredCity) : null;

  if (!cityKey) {
    return {
      city: FALLBACK_CITY,
      region: FALLBACK_REGION,
      venue: TOUR_VENUES_BY_CITY['los angeles'][0],
    };
  }

  return {
    city: CITY_DISPLAY_NAMES[cityKey],
    region: region?.trim() || FALLBACK_REGION,
    venue: TOUR_VENUES_BY_CITY[cityKey][0],
  };
}

/* ------------------------------------------------------------------ */
/*  Mode content panels                                                */
/* ------------------------------------------------------------------ */

export const MOCK_TOUR_DATES = [
  { city: 'Los Angeles, CA', venue: 'Academy LA', date: 'Apr 12' },
] as const;

function ListenContent() {
  const dsps = [
    { name: 'Spotify', action: 'Play' },
    { name: 'Apple Music', action: 'Listen' },
    { name: 'YouTube Music', action: 'Watch' },
  ] as const;
  return (
    <div className='flex h-full flex-col justify-center gap-3'>
      {dsps.map(dsp => (
        <div
          key={dsp.name}
          className='flex items-center justify-between rounded-full bg-surface-1 px-3 py-2.5'
        >
          <span className='text-[12px] font-medium text-primary-token'>
            {dsp.name}
          </span>
          <span className='text-[10px] text-tertiary-token'>{dsp.action}</span>
        </div>
      ))}
    </div>
  );
}

function PayContent() {
  return (
    <div className='flex h-full flex-col justify-center gap-3'>
      <p className='text-[10px] font-medium uppercase tracking-[0.15em] text-tertiary-token'>
        Choose amount
      </p>
      <div className='grid grid-cols-3 gap-2'>
        {([5, 10, 20] as const).map((amount, i) => (
          <div
            key={amount}
            className={`flex aspect-square flex-col items-center justify-center gap-0.5 rounded-[999px] text-center ${
              i === 1
                ? 'bg-surface-2 text-primary-token shadow-sm'
                : 'bg-surface-1 text-primary-token'
            }`}
          >
            <span
              className={`text-[10px] font-medium uppercase tracking-wider ${
                i === 1 ? 'text-secondary-token' : 'text-tertiary-token'
              }`}
            >
              USD
            </span>
            <span className='text-xl font-semibold tabular-nums tracking-tight'>
              ${amount}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TourContent() {
  const show = MOCK_TOUR_DATES[0];
  return (
    <div className='flex h-full flex-col justify-center gap-3'>
      <div className='flex w-full items-center justify-between rounded-full bg-surface-1 px-3 py-2.5'>
        <div className='min-w-0'>
          <p className='text-[13px] font-medium text-primary-token truncate'>
            {show.venue}
          </p>
          <p className='text-[11px] text-tertiary-token'>{show.city}</p>
        </div>
        <span className='shrink-0 text-[11px] font-medium text-secondary-token'>
          {show.date}
        </span>
      </div>
      <span className='text-[12px] font-medium text-tertiary-token'>
        See more dates
      </span>
    </div>
  );
}

function ProfileContent() {
  return (
    <div className='flex h-full flex-col justify-center gap-3'>
      {/* Horizontal release card — album art left, action right */}
      <div className='flex items-center gap-3 rounded-full bg-surface-1 p-2.5'>
        <div
          className='h-14 w-14 shrink-0 overflow-hidden rounded-lg shadow-sm'
          style={{
            background:
              'linear-gradient(135deg, rgba(113,112,255,0.3) 0%, rgba(113,112,255,0.08) 100%)',
          }}
        />
        <div className='min-w-0 flex-1'>
          <p className='text-[10px] font-medium uppercase tracking-[0.12em] text-tertiary-token'>
            Out now
          </p>
          <p className='text-[13px] font-semibold text-primary-token truncate'>
            New Single
          </p>
        </div>
        <span className='shrink-0 rounded-full bg-btn-primary px-3.5 py-1.5 text-[12px] font-semibold text-btn-primary-foreground shadow-sm'>
          Listen
        </span>
      </div>
    </div>
  );
}

/** Pre-built mode content keyed by mode ID. */
export const MODE_CONTENT: Record<string, React.ReactNode> = {
  listen: <ListenContent />,
  pay: <PayContent />,
  tour: <TourContent />,
  profile: <ProfileContent />,
};

/** Mode IDs in display order. */
export const MODE_IDS = ['profile', 'tour', 'pay', 'listen'] as const;
