import { BrandLogo } from '@/components/atoms/BrandLogo';

interface AuthBrandingProps {
  title: string;
  description: string;
  gradientVariant?:
    | 'blue-purple-cyan'
    | 'purple-cyan-blue'
    | 'purple-pink-orange'
    | 'green-blue-purple'
    | 'red-orange-yellow';
  textColorClass?: string;
  showText?: boolean;
}

// Static gradient mappings to ensure Tailwind classes are preserved during build
// Enhanced with dark mode variants for richer aesthetics
const gradientVariants = {
  'blue-purple-cyan':
    'bg-gradient-to-br from-blue-600 via-purple-600 to-cyan-600 dark:from-blue-700 dark:via-purple-700 dark:to-cyan-700',
  'purple-cyan-blue':
    'bg-gradient-to-br from-purple-600 via-cyan-600 to-blue-600 dark:from-purple-700 dark:via-cyan-700 dark:to-blue-700',
  'purple-pink-orange':
    'bg-gradient-to-br from-purple-600 via-pink-600 to-orange-600 dark:from-purple-700 dark:via-pink-700 dark:to-orange-700',
  'green-blue-purple':
    'bg-gradient-to-br from-green-600 via-blue-600 to-purple-600 dark:from-green-700 dark:via-blue-700 dark:to-purple-700',
  'red-orange-yellow':
    'bg-gradient-to-br from-red-600 via-orange-600 to-yellow-600 dark:from-red-700 dark:via-orange-700 dark:to-yellow-700',
} as const;

export function AuthBranding({
  title,
  description,
  gradientVariant = 'blue-purple-cyan',
  textColorClass = 'text-blue-100 dark:text-blue-200',
  showText = true,
}: Readonly<AuthBrandingProps>) {
  const gradientClass = gradientVariants[gradientVariant];

  return (
    <div
      className={`hidden lg:flex lg:flex-1 lg:flex-col lg:justify-center lg:px-12 xl:px-16 relative overflow-hidden ${gradientClass}`}
    >
      {/* Subtle noise texture overlay for depth */}
      <div className='absolute inset-0 opacity-[0.015] dark:opacity-[0.03] bg-[url("data:image/svg+xml,%3Csvg viewBox=%270 0 256 256%27 xmlns=%27http://www.w3.org/2000/svg%27%3E%3Cfilter id=%27noise%27%3E%3CfeTurbulence type=%27fractalNoise%27 baseFrequency=%270.8%27 numOctaves=%274%27 stitchTiles=%27stitch%27/%3E%3C/filter%3E%3Crect width=%27100%25%27 height=%27100%25%27 filter=%27url(%23noise)%27/%3E%3C/svg%3E")] pointer-events-none' />

      <div className='relative mx-auto w-full max-w-[18rem] z-10'>
        <div className='text-center'>
          <div className='mb-8'>
            <BrandLogo
              size={64}
              tone='white'
              className='mx-auto drop-shadow-lg'
            />
          </div>
          {showText && (
            <>
              <h1 className='text-3xl font-bold text-white dark:text-white/95 mb-4 drop-shadow-sm'>
                {title}
              </h1>
              <p className={`${textColorClass} text-lg leading-relaxed`}>
                {description}
              </p>
            </>
          )}
        </div>

        {/* Decorative elements with enhanced dark mode glow */}
        <div className='absolute top-20 left-20 w-32 h-32 bg-white/10 dark:bg-white/15 rounded-full blur-xl animate-pulse-slow motion-reduce:animate-none' />
        <div className='absolute bottom-20 right-20 w-40 h-40 bg-white/10 dark:bg-white/15 rounded-full blur-xl animate-pulse-slow motion-reduce:animate-none [animation-delay:1s]' />
        <div className='absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-white/5 dark:bg-white/8 rounded-full blur-3xl' />
      </div>

      {/* Bottom gradient fade for smooth transition */}
      <div className='absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-black/10 dark:from-black/20 to-transparent pointer-events-none' />
    </div>
  );
}
