import { Logo } from '@/components/ui/Logo';

interface AuthBrandingProps {
  title: string;
  description: string;
  gradientVariant?: 'blue-purple-cyan' | 'purple-cyan-blue' | 'purple-pink-orange' | 'green-blue-purple' | 'red-orange-yellow';
  textColorClass?: string;
}

// Static gradient mappings to ensure Tailwind classes are preserved during build
const gradientVariants = {
  'blue-purple-cyan': 'bg-gradient-to-br from-blue-600 via-purple-600 to-cyan-600',
  'purple-cyan-blue': 'bg-gradient-to-br from-purple-600 via-cyan-600 to-blue-600',
  'purple-pink-orange': 'bg-gradient-to-br from-purple-600 via-pink-600 to-orange-600',
  'green-blue-purple': 'bg-gradient-to-br from-green-600 via-blue-600 to-purple-600',
  'red-orange-yellow': 'bg-gradient-to-br from-red-600 via-orange-600 to-yellow-600'
} as const;

export function AuthBranding({
  title,
  description,
  gradientVariant = 'blue-purple-cyan',
  textColorClass = 'text-blue-100'
}: AuthBrandingProps) {
  const gradientClass = gradientVariants[gradientVariant];
  
  return (
    <div className={`hidden lg:flex lg:flex-1 lg:flex-col lg:justify-center lg:px-12 xl:px-16 ${gradientClass}`}>
      <div className="mx-auto w-full max-w-sm">
        <div className="text-center">
          <div className="mb-8">
            <Logo size="xl" className="text-white mx-auto" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-4">
            {title}
          </h1>
          <p className={`${textColorClass} text-lg leading-relaxed`}>
            {description}
          </p>
        </div>
        
        {/* Decorative elements */}
        <div className="absolute top-20 left-20 w-32 h-32 bg-white/10 rounded-full blur-xl"></div>
        <div className="absolute bottom-20 right-20 w-40 h-40 bg-white/10 rounded-full blur-xl"></div>
      </div>
    </div>
  );
}