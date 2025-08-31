'use client';

import { ReactNode } from 'react';
import { AuthBranding } from './AuthBranding';
import { AuthFormContainer } from './AuthFormContainer';

interface AuthLayoutProps {
  children: ReactNode;
  brandingTitle: string;
  brandingDescription: string;
  formTitle: string;
  gradientFrom?: string;
  gradientVia?: string;
  gradientTo?: string;
  textColorClass?: string;
}

export function AuthLayout({
  children,
  brandingTitle,
  brandingDescription,
  formTitle,
  gradientFrom = 'blue-600',
  gradientVia = 'purple-600',
  gradientTo = 'cyan-600',
  textColorClass = 'text-blue-100',
}: AuthLayoutProps) {
  // Map the gradient props to the correct variant
  const getGradientVariant = () => {
    if (
      gradientFrom === 'blue-600' &&
      gradientVia === 'purple-600' &&
      gradientTo === 'cyan-600'
    ) {
      return 'blue-purple-cyan';
    }
    if (
      gradientFrom === 'purple-600' &&
      gradientVia === 'cyan-600' &&
      gradientTo === 'blue-600'
    ) {
      return 'purple-cyan-blue';
    }
    // Default fallback
    return 'blue-purple-cyan';
  };

  return (
    <div className='min-h-screen flex'>
      <AuthBranding
        title={brandingTitle}
        description={brandingDescription}
        gradientVariant={getGradientVariant()}
        textColorClass={textColorClass}
      />
      <AuthFormContainer title={formTitle}>{children}</AuthFormContainer>
    </div>
  );
}
