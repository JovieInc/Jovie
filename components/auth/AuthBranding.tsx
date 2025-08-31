import { Logo } from '@/components/ui/Logo';

interface AuthBrandingProps {
  title: string;
  description: string;
  gradientFrom?: string;
  gradientVia?: string;
  gradientTo?: string;
  textColorClass?: string;
}

export function AuthBranding({
  title,
  description,
  gradientFrom = 'blue-600',
  gradientVia = 'purple-600',
  gradientTo = 'cyan-600',
  textColorClass = 'text-blue-100'
}: AuthBrandingProps) {
  return (
    <div className={`hidden lg:flex lg:flex-1 lg:flex-col lg:justify-center lg:px-12 xl:px-16 bg-gradient-to-br from-${gradientFrom} via-${gradientVia} to-${gradientTo}`}>
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