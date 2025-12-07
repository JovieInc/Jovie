import type { ReactNode } from 'react';
import { AuthBranding } from './AuthBranding';
import { AuthFormContainer } from './AuthFormContainer';

type GradientVariant =
  | 'blue-purple-cyan'
  | 'purple-cyan-blue'
  | 'purple-pink-orange'
  | 'green-blue-purple'
  | 'red-orange-yellow';

interface AuthLayoutProps {
  children: ReactNode;
  formTitle: string;
  brandingTitle?: string;
  brandingDescription?: string;
  gradientVariant?: GradientVariant;
  textColorClass?: string;
  brandingShowText?: boolean;
}

export function AuthLayout({
  children,
  formTitle,
  brandingTitle = 'Welcome to Jovie',
  brandingDescription = 'Create your artist profile and share your music with the world.',
  gradientVariant = 'blue-purple-cyan',
  textColorClass = 'text-blue-100',
  brandingShowText = true,
}: AuthLayoutProps) {
  return (
    <div className='min-h-screen flex bg-base text-primary-token'>
      <AuthBranding
        title={brandingTitle}
        description={brandingDescription}
        gradientVariant={gradientVariant}
        textColorClass={textColorClass}
        showText={brandingShowText}
      />
      <AuthFormContainer title={formTitle}>{children}</AuthFormContainer>
    </div>
  );
}
